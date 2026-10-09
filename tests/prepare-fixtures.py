"""Create bounded PostgreSQL and MySQL fixtures on the assigned Linux test host."""
import json
import os
import pathlib
import secrets
import subprocess

root = pathlib.Path(os.environ["OOS_FIXTURE_DIR"]).resolve()
root.mkdir(parents=True, exist_ok=True)
os.chmod(root, 0o755)
tls = root / "tls"
tls.mkdir(exist_ok=True)
os.chmod(tls, 0o755)


def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout


if not (tls / "ca.crt").exists():
    run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-days", "7", "-subj", "/CN=OOS disposable database CA", "-addext", "basicConstraints=critical,CA:TRUE", cwd=tls)
    (tls / "server.ext").write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n")
    run("openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost", cwd=tls)
    run("openssl", "x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "7", "-extfile", "server.ext", cwd=tls)
    os.chmod(tls / "ca.key", 0o600)
    run("sudo", "-n", "chown", "999:999", str(tls / "server.key"))
    run("sudo", "-n", "chmod", "600", str(tls / "server.key"))

credentials_file = root / "credentials.json"
if not credentials_file.exists():
    credentials = {"postgres": secrets.token_urlsafe(24), "mysql": secrets.token_urlsafe(24), "mysqlRoot": secrets.token_urlsafe(24)}
    credentials_file.write_text(json.dumps(credentials))
    os.chmod(credentials_file, 0o600)
credentials = json.loads(credentials_file.read_text())
specs = [
    ("postgres", "oos-pg-20261009", "postgres:16", "127.0.0.1:55432:5432", {"POSTGRES_USER": "oos", "POSTGRES_DB": "oos", "POSTGRES_PASSWORD": credentials["postgres"]}, ["-c", "ssl=on", "-c", "ssl_cert_file=/fixture/server.crt", "-c", "ssl_key_file=/fixture/server.key"]),
    ("mysql", "oos-mysql-20261009", "mysql:8.4", "127.0.0.1:53306:3306", {"MYSQL_USER": "oos", "MYSQL_DATABASE": "oos", "MYSQL_PASSWORD": credentials["mysql"], "MYSQL_ROOT_PASSWORD": credentials["mysqlRoot"]}, ["--ssl-ca=/fixture/ca.crt", "--ssl-cert=/fixture/server.crt", "--ssl-key=/fixture/server.key", "--require-secure-transport=ON"]),
]
for engine, name, image, port, environment, flags in specs:
    env_file = root / f"{engine}.env"
    env_file.write_text("".join(f"{key}={value}\n" for key, value in environment.items()))
    os.chmod(env_file, 0o600)
    existing = run("sudo", "-n", "docker", "ps", "-a", "--filter", f"name=^{name}$", "--format", "{{.Names}}")
    if existing.strip():
        print(f"{name} already exists.")
        continue
    command = ["sudo", "-n", "docker", "run", "-d", "--name", name, "--label", "synehq-oos.fixture=20261009", "--memory", "768m", "--cpus", "1", "--pids-limit", "128", "-p", port, "--env-file", str(env_file)]
    for filename in ["ca.crt", "server.crt", "server.key"]:
        command += ["--mount", f"type=bind,source={tls / filename},target=/fixture/{filename},readonly"]
    command += [image, *flags]
    run(*command)
    print(f"Started {name} on {port}.")
