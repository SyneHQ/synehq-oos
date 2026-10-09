// Copyright 2026 SyneHQ. SPDX-License-Identifier: Apache-2.0
package main

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"syscall"
	"time"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "health" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "3100"
		}
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			os.Exit(1)
		}
		client := &http.Client{Timeout: 2 * time.Second}
		response, err := client.Get("http://" + net.JoinHostPort("127.0.0.1", port) + "/healthz")
		if err != nil {
			os.Exit(1)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		return
	}
	if len(os.Args) >= 5 && os.Args[1] == "lock" {
		if err := lockAndExec(os.Args[2], os.Args[3:]); err != nil {
			fmt.Fprintln(os.Stderr, "The data volume is unavailable, unsafe, or already in use.")
			os.Exit(1)
		}
		return
	}
	if len(os.Args) != 3 || !filepath.IsAbs(os.Args[1]) || !regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`).MatchString(os.Args[2]) {
		fmt.Fprintln(os.Stderr, "Use certificates with an absolute TLS directory and installation scope.")
		os.Exit(1)
	}
	if err := prepare(os.Args[1], os.Args[2]); err != nil {
		fmt.Fprintln(os.Stderr, "Local TLS initialization failed. Check the private TLS directory and certificate pairs.")
		os.Exit(1)
	}
}

func privateFile(path string) ([]byte, error) {
	s, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !s.Mode().IsRegular() || s.Mode().Perm()&0077 != 0 || s.Size() > 65536 {
		return nil, errors.New("invalid private file")
	}
	return os.ReadFile(path)
}

func write(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	return errors.Join(err, closeErr)
}

func readPair(dir, name string) (*x509.Certificate, crypto.Signer, error) {
	crt, err := privateFile(filepath.Join(dir, name+".crt"))
	if err != nil {
		return nil, nil, err
	}
	key, err := privateFile(filepath.Join(dir, name+".key"))
	if err != nil {
		return nil, nil, err
	}
	cb, _ := pem.Decode(crt)
	kb, _ := pem.Decode(key)
	if cb == nil || kb == nil {
		return nil, nil, errors.New("invalid PEM")
	}
	c, err := x509.ParseCertificate(cb.Bytes)
	if err != nil {
		return nil, nil, err
	}
	k, err := x509.ParsePKCS8PrivateKey(kb.Bytes)
	if err != nil {
		return nil, nil, err
	}
	ec, ok := k.(crypto.Signer)
	public, publicOK := c.PublicKey.(interface{ Equal(crypto.PublicKey) bool })
	if !ok || !publicOK || !public.Equal(ec.Public()) {
		return nil, nil, errors.New("certificate key mismatch")
	}
	return c, ec, nil
}

func pair(dir, name string, template *x509.Certificate, parent *x509.Certificate, parentKey crypto.Signer) (*x509.Certificate, crypto.Signer, error) {
	cp, kp := filepath.Join(dir, name+".crt"), filepath.Join(dir, name+".key")
	_, ce := os.Lstat(cp)
	_, ke := os.Lstat(kp)
	if ce == nil || ke == nil {
		return readPair(dir, name)
	}
	if !os.IsNotExist(ce) || !os.IsNotExist(ke) {
		return nil, nil, errors.New("invalid certificate path")
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}
	template.SerialNumber = serial
	template.NotBefore = time.Now().Add(-5 * time.Minute)
	if parent == nil {
		parent, parentKey = template, key
	}
	der, err := x509.CreateCertificate(rand.Reader, template, parent, &key.PublicKey, parentKey)
	if err != nil {
		return nil, nil, err
	}
	encodedKey, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, nil, err
	}
	if err = write(kp, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encodedKey})); err != nil {
		return nil, nil, err
	}
	if err = write(cp, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})); err != nil {
		return nil, nil, err
	}
	cert, err := x509.ParseCertificate(der)
	return cert, key, err
}

func prepare(dir, scope string) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	s, err := os.Lstat(dir)
	if err != nil || !s.IsDir() || s.Mode()&os.ModeSymlink != 0 || s.Mode().Perm() != 0700 {
		return errors.New("invalid TLS directory")
	}
	ca, caKey, err := pair(dir, "ca", &x509.Certificate{
		Subject: pkix.Name{CommonName: "SyneHQ OOS local CA"}, IsCA: true, BasicConstraintsValid: true,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign, NotAfter: time.Now().AddDate(10, 0, 0),
	}, nil, nil)
	if err != nil {
		return err
	}
	roots := x509.NewCertPool()
	roots.AddCert(ca)
	for _, name := range []string{"gateway", "resolver", "worker"} {
		t := &x509.Certificate{Subject: pkix.Name{CommonName: "synehq-oos-" + name}, BasicConstraintsValid: true,
			KeyUsage: x509.KeyUsageDigitalSignature, NotAfter: time.Now().AddDate(1, 0, 0), ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
		if name == "worker" {
			uri, _ := url.Parse("spiffe://kelvo/tenant/" + scope + "/worker/application")
			t.URIs = []*url.URL{uri}
			t.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
		} else {
			t.DNSNames = []string{"localhost"}
			t.IPAddresses = []net.IP{net.ParseIP("127.0.0.1")}
			if name == "gateway" {
				uri, _ := url.Parse("spiffe://kelvo/gateway")
				t.URIs = []*url.URL{uri}
			}
			if name == "resolver" {
				t.DNSNames = append(t.DNSNames, "application")
			}
		}
		c, _, err := pair(dir, name, t, ca, caKey)
		if err != nil {
			return err
		}
		if _, err = c.Verify(x509.VerifyOptions{Roots: roots, KeyUsages: t.ExtKeyUsage}); err != nil {
			return err
		}
		if name == "worker" && (len(c.URIs) != 1 || c.URIs[0].String() != t.URIs[0].String()) {
			return errors.New("worker identity mismatch")
		}
		if name != "worker" {
			if err = c.VerifyHostname("127.0.0.1"); err != nil {
				return err
			}
		}
	}
	return nil
}

func lockAndExec(directory string, command []string) error {
	if !filepath.IsAbs(directory) || len(command) < 1 || !filepath.IsAbs(command[0]) {
		return errors.New("invalid runtime path")
	}
	s, err := os.Lstat(directory)
	if err != nil || !s.IsDir() || s.Mode()&os.ModeSymlink != 0 {
		return errors.New("invalid data volume")
	}
	if err = os.Chmod(directory, 0700); err != nil {
		return err
	}
	fd, err := syscall.Open(filepath.Join(directory, ".runtime.lock"), syscall.O_RDWR|syscall.O_CREAT|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	var stat syscall.Stat_t
	if err = syscall.Fstat(fd, &stat); err != nil {
		syscall.Close(fd)
		return err
	}
	if stat.Mode&syscall.S_IFMT != syscall.S_IFREG || stat.Nlink != 1 || stat.Mode&0077 != 0 || stat.Uid != uint32(os.Geteuid()) {
		syscall.Close(fd)
		return errors.New("unsafe runtime lock")
	}
	if err = syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		syscall.Close(fd)
		return err
	}
	// The lock stays open across exec and releases when the Node process exits.
	return syscall.Exec(command[0], command, os.Environ())
}
