package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCertificatesPreserveKeysAndScope(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := prepare(dir, "fixture"); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(filepath.Join(dir, "worker.key"))
	if err != nil {
		t.Fatal(err)
	}
	if err := prepare(dir, "fixture"); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(filepath.Join(dir, "worker.key"))
	if string(before) != string(after) {
		t.Fatal("restart replaced a private key")
	}
	if err := prepare(dir, "different"); err == nil {
		t.Fatal("wrong worker scope accepted")
	}
	if err := os.Remove(filepath.Join(dir, "gateway.key")); err != nil {
		t.Fatal(err)
	}
	if err := prepare(dir, "fixture"); err == nil {
		t.Fatal("incomplete key pair accepted")
	}
}

func TestExistingRSAKeyPair(t *testing.T) {
	dir := t.TempDir()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "legacy"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	if err = write(filepath.Join(dir, "legacy.crt"), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})); err != nil {
		t.Fatal(err)
	}
	if err = write(filepath.Join(dir, "legacy.key"), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encoded})); err != nil {
		t.Fatal(err)
	}
	if _, _, err = readPair(dir, "legacy"); err != nil {
		t.Fatal("existing RSA key rejected", err)
	}
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ = x509.MarshalPKCS8PrivateKey(other)
	if err = os.WriteFile(filepath.Join(dir, "legacy.key"), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: encoded}), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err = readPair(dir, "legacy"); err == nil {
		t.Fatal("mismatched key accepted")
	}
}
