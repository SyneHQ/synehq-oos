"""Prepare isolated database fixtures on the assigned Linux test host.

Credentials and generated certificates remain outside the source checkout.
Only containers with this script's exact fixture label can be reused.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import time
import urllib.request


LABEL = "synehq-oos.fixture=20261009-six-engines"
IMAGES = {
    "clickhouse": "clickhouse/clickhouse-server@sha256:77475011e36a9cbc6f107c59b7a925f0e810d9d7416df35083b5c9382466ff2d",
    "mongodb": "mongo@sha256:4968f22d0c6c10ef29952f3e807f62872ba22b3312f25803564fbfc08255efc2",
    "oracle": "gvenzl/oracle-free@sha256:366fe85702d764d81a0272b72e94e629290c27aa72a47825fcc45701a0633dac",
}
ROOT = Path(os.environ["OOS_FIXTURE_DIR"]).resolve()
TLS = ROOT / "tls"


def run(*args, input=None, check=True, timeout=120):
    result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(f"Fixture command failed: {args[0]} {args[1] if len(args) > 1 else ''}")
    return result


def docker(*args, **kwargs):
    return run("sudo", "-n", "docker", *args, **kwargs)


def private_file(path, text):
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
    with temporary.open("x") as stream:
        temporary.chmod(0o600)
        stream.write(text)
    temporary.replace(path)


def credentials():
    path = ROOT / "credentials.json"
    data = json.loads(path.read_text()) if path.exists() else {}
    for name in ["clickhouse", "mongodb", "mongoRoot", "oracle", "oracleRoot", "oracleWallet"]:
        data.setdefault(name, secrets.token_hex(24))
    private_file(path, json.dumps(data))
    return data


def server_key():
    return run("sudo", "-n", "cat", str(TLS / "server.key")).stdout


def ensure_container(engine, port, env, arguments=(), mounts=(), memory="1g", cpus="1"):
    name = f"oos-{engine}-six-20261009"
    found = docker("inspect", name, check=False)
    if found.returncode == 0:
        details = json.loads(found.stdout)[0]
        if details["Config"].get("Labels", {}).get("synehq-oos.fixture") != LABEL.split("=", 1)[1]:
            raise RuntimeError("Refusing to reuse a container with another owner.")
        if not details["State"]["Running"]:
            docker("start", name)
        return name
    env_path = ROOT / f"{engine}-six.env"
    private_file(env_path, "".join(f"{key}={value}\n" for key, value in env.items()))
    args = ["run", "-d", "--pull=never", "--name", name, "--label", LABEL,
            "--memory", memory, "--memory-swap", memory, "--cpus", cpus,
            "--pids-limit", "256", "--security-opt", "no-new-privileges:true",
            "-p", port, "--env-file", str(env_path)]
    for source, target in mounts:
        args += ["--mount", f"type=bind,source={source},target={target},readonly"]
    args += [IMAGES[engine], *arguments]
    docker(*args, timeout=180)
    return name


def wait_until(check, label, seconds=180):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            print(f"{label} ready.", flush=True)
            return
        time.sleep(1)
    raise RuntimeError(f"{label} did not become ready within its deadline.")


def prepare_clickhouse(data):
    directory = ROOT / "clickhouse-six"
    directory.mkdir(exist_ok=True)
    key = directory / "server.key"
    private_file(key, server_key())
    run("sudo", "-n", "chown", "101:101", str(key))
    config = directory / "tls.xml"
    config.write_text("""<clickhouse>
  <logger><level>warning</level><console>true</console></logger>
  <https_port>8443</https_port>
  <openSSL><server>
    <certificateFile>/fixture/server.crt</certificateFile>
    <privateKeyFile>/fixture/server.key</privateKeyFile>
    <verificationMode>none</verificationMode>
    <disableProtocols>sslv2,sslv3,tlsv1,tlsv1_1</disableProtocols>
  </server></openSSL>
  <max_server_memory_usage>805306368</max_server_memory_usage>
  <max_thread_pool_size>512</max_thread_pool_size>
  <background_schedule_pool_size>16</background_schedule_pool_size>
  <background_buffer_flush_schedule_pool_size>2</background_buffer_flush_schedule_pool_size>
  <background_message_broker_schedule_pool_size>2</background_message_broker_schedule_pool_size>
  <background_distributed_schedule_pool_size>2</background_distributed_schedule_pool_size>
  <background_pool_size>16</background_pool_size>
</clickhouse>
""")
    ensure_container("clickhouse", "127.0.0.1:54843:8443", {
        "CLICKHOUSE_DB": "oos", "CLICKHOUSE_USER": "oos",
        "CLICKHOUSE_PASSWORD": data["clickhouse"], "CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT": "1",
    }, mounts=[(config, "/etc/clickhouse-server/config.d/oos-tls.xml"),
               (key, "/fixture/server.key"), (TLS / "server.crt", "/fixture/server.crt")])
    curl_config = ROOT / "clickhouse-curl.conf"
    private_file(curl_config, f'user = "oos:{data["clickhouse"]}"\ncacert = "{TLS / "ca.crt"}"\n')

    def query(sql):
        return run("curl", "--silent", "--show-error", "--fail", "--max-time", "15",
                   "--config", str(curl_config), "--data-binary", "@-",
                   "https://127.0.0.1:54843/?database=oos", input=sql, check=False)

    wait_until(lambda: query("SELECT 1").returncode == 0, "ClickHouse TLS")
    statements = [
        "CREATE TABLE IF NOT EXISTS accounts (id Int64, name String, balance Decimal(26,8), created_at DateTime64(6), note Nullable(String)) ENGINE=MergeTree ORDER BY id",
        "CREATE TABLE IF NOT EXISTS orders (id Int32, account_id Int64, amount Decimal(12,2)) ENGINE=MergeTree ORDER BY id",
    ]
    for sql in statements:
        if query(sql).returncode:
            raise RuntimeError("ClickHouse fixture schema failed.")
    if query("SELECT count() FROM accounts").stdout.strip() == "0":
        if query("INSERT INTO accounts VALUES (2,'Northwind',80.25000000,'2026-10-08 10:20:30.654321','sample'),(9007199254740993,'Acme',1234567890123456.12345678,'2026-10-09 12:34:56.123456',NULL)").returncode:
            raise RuntimeError("ClickHouse fixture rows failed.")
        if query("INSERT INTO orders VALUES (1,2,43.50),(2,2,19.00)").returncode:
            raise RuntimeError("ClickHouse fixture orders failed.")
    print("ClickHouse schema and rows ready.", flush=True)


def prepare_mongodb(data):
    directory = ROOT / "mongodb-six"
    directory.mkdir(exist_ok=True)
    pem = directory / "server.pem"
    private_file(pem, (TLS / "server.crt").read_text() + server_key())
    run("sudo", "-n", "chown", "999:999", str(pem))
    name = ensure_container("mongodb", "127.0.0.1:57017:27017", {
        "MONGO_INITDB_ROOT_USERNAME": "oos_admin", "MONGO_INITDB_ROOT_PASSWORD": data["mongoRoot"],
    }, arguments=["--bind_ip_all", "--wiredTigerCacheSizeGB", "0.25", "--tlsMode", "requireTLS",
                  "--tlsCertificateKeyFile", "/fixture/server.pem", "--tlsCAFile", "/fixture/ca.crt",
                  "--tlsAllowConnectionsWithoutCertificates"],
       mounts=[(pem, "/fixture/server.pem"), (TLS / "ca.crt", "/fixture/ca.crt")])

    def shell(script):
        auth = f"const a=db.getSiblingDB('admin').auth('oos_admin',{json.dumps(data['mongoRoot'])});if (!(a===1 || a.ok===1)) quit(3);\n"
        return docker("exec", "-i", name, "mongosh", "--quiet", "--norc", "--host", "localhost",
                      "--tls", "--tlsCAFile", "/fixture/ca.crt", "--file", "/dev/stdin",
                      input=auth + script, check=False, timeout=20)

    wait_until(lambda: shell("if(db.adminCommand({ping:1}).ok!==1) quit(3);").returncode == 0, "MongoDB TLS")
    script = f"""const fixture=db.getSiblingDB('oos');
if(!fixture.getUser('oos')) fixture.createUser({{user:'oos',pwd:{json.dumps(data['mongodb'])},roles:[{{role:'readWrite',db:'oos'}}]}});
fixture.accounts.updateOne({{_id:ObjectId('650000000000000000000001')}},{{$setOnInsert:{{name:'Northwind',balance:Decimal128('80.25000000'),account_id:Long('2'),note:'sample'}}}},{{upsert:true}});
fixture.accounts.updateOne({{_id:ObjectId('650000000000000000000002')}},{{$setOnInsert:{{name:'Acme',balance:Decimal128('1234567890123456.12345678'),account_id:Long('9007199254740993'),note:null}}}},{{upsert:true}});
fixture.orders.updateOne({{_id:ObjectId('660000000000000000000001')}},{{$setOnInsert:{{account_id:Long('2'),amount:Decimal128('43.50')}}}},{{upsert:true}});
"""
    if shell(script).returncode:
        raise RuntimeError("MongoDB fixture schema failed.")
    print("MongoDB collections and documents ready.", flush=True)


def prepare_sqlite():
    directory = Path(os.environ["OOS_SQLITE_ROOT"]).resolve()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = directory / "sample.sqlite"
    with sqlite3.connect(path) as db:
        db.executescript("""
        PRAGMA journal_mode=DELETE;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, balance TEXT, created_at TEXT, note TEXT);
        CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id), amount TEXT);
        INSERT OR IGNORE INTO accounts VALUES (2,'Northwind','80.25000000','2026-10-08 10:20:30.654321','sample');
        INSERT OR IGNORE INTO accounts VALUES (9007199254740993,'Acme','1234567890123456.12345678','2026-10-09 12:34:56.123456',NULL);
        INSERT OR IGNORE INTO orders VALUES (1,2,'43.50'),(2,2,'19.00');
        """)
    path.chmod(0o600)
    print("SQLite server file ready.", flush=True)


def prepare_oracle(data):
    name = ensure_container("oracle", "127.0.0.1:52484:2484", {
        "ORACLE_PASSWORD": data["oracleRoot"], "APP_USER": "OOS", "APP_USER_PASSWORD": data["oracle"],
    }, memory="3g", cpus="2")
    wait_until(lambda: docker("exec", name, "healthcheck.sh", check=False, timeout=20).returncode == 0,
               "Oracle database", seconds=600)
    directory = ROOT / "oracle-six"
    directory.mkdir(mode=0o700, exist_ok=True)
    # The slim image omits Java and the wallet tool jars. These are fixture tools only.
    if docker("exec", name, "java", "-version", check=False).returncode:
        docker("exec", "-u", "0", name, "microdnf", "install", "-y",
               "java-17-openjdk-headless", timeout=600)
    jar = directory / "oraclepki.jar"
    checksum = "3e180d09700e56f167052c160b3a16ce5a953455187cc60986a853109fff2356"
    if not jar.exists():
        url = "https://repo.maven.apache.org/maven2/com/oracle/database/security/oraclepki/23.26.3.0.0/oraclepki-23.26.3.0.0.jar"
        with urllib.request.urlopen(url, timeout=30) as response:
            jar.write_bytes(response.read(4 * 1024 * 1024))
    if hashlib.sha256(jar.read_bytes()).hexdigest() != checksum:
        raise RuntimeError("The Oracle wallet helper checksum differs.")
    password = directory / "wallet-password"
    key = directory / "server.key"
    private_file(password, data["oracleWallet"])
    private_file(key, server_key())
    bundle = directory / "server.p12"
    run("openssl", "pkcs12", "-export", "-inkey", str(key), "-in", str(TLS / "server.crt"),
        "-certfile", str(TLS / "ca.crt"), "-out", str(bundle), "-passout", f"file:{password}")
    bundle.chmod(0o600)
    docker("exec", "-u", "0", name, "mkdir", "-p", "/fixture-tools", "/opt/oracle/oos-wallet")
    docker("cp", str(jar), f"{name}:/fixture-tools/oraclepki.jar")
    docker("cp", str(bundle), f"{name}:/fixture-tools/server.p12")
    docker("exec", "-u", "0", name, "chown", "-R", "54321:54321", "/fixture-tools", "/opt/oracle/oos-wallet")
    tool = ["exec", name, "java", "-cp", "/fixture-tools/oraclepki.jar", "oracle.security.pki.textui.OraclePKITextUI"]
    wallet = "/opt/oracle/oos-wallet"
    if docker("exec", name, "test", "-f", wallet + "/cwallet.sso", check=False).returncode:
        docker(*tool, "wallet", "create", "-wallet", wallet, "-pwd", data["oracleWallet"], "-auto_login")
        docker(*tool, "wallet", "import_pkcs12", "-wallet", wallet, "-pwd", data["oracleWallet"],
               "-pkcs12file", "/fixture-tools/server.p12", "-pkcs12pwd", data["oracleWallet"])
    home = docker("exec", name, "printenv", "ORACLE_HOME").stdout.strip()
    files = {
        "listener.ora": """LISTENER =
 (DESCRIPTION_LIST =
  (DESCRIPTION =
   (ADDRESS = (PROTOCOL = IPC)(KEY = EXTPROC_FOR_FREE))
   (ADDRESS = (PROTOCOL = TCP)(HOST = 127.0.0.1)(PORT = 1521))
   (ADDRESS = (PROTOCOL = TCPS)(HOST = 0.0.0.0)(PORT = 2484))
  )
 )
DEFAULT_SERVICE_LISTENER = FREE
WALLET_LOCATION = (SOURCE = (METHOD = FILE)(METHOD_DATA = (DIRECTORY = /opt/oracle/oos-wallet)))
SSL_CLIENT_AUTHENTICATION = FALSE
""",
        "sqlnet.ora": """NAMES.DIRECTORY_PATH = (EZCONNECT, TNSNAMES)
DISABLE_OOB = ON
BREAK_POLL_SKIP = 1000
WALLET_LOCATION = (SOURCE = (METHOD = FILE)(METHOD_DATA = (DIRECTORY = /opt/oracle/oos-wallet)))
SSL_CLIENT_AUTHENTICATION = FALSE
""",
    }
    for filename, content in files.items():
        path = directory / filename
        path.write_text(content)
        docker("cp", str(path), f"{name}:{home}/network/admin/{filename}")
    docker("exec", name, "lsnrctl", "stop")
    docker("exec", name, "lsnrctl", "start")
    sql = """whenever sqlerror exit failure rollback
alter system set local_listener='(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT=1521))' scope=both;
alter system register;
alter session set container=FREEPDB1;
alter session set current_schema=OOS;
begin
 execute immediate 'CREATE TABLE accounts (id NUMBER(19) PRIMARY KEY, name VARCHAR2(128) NOT NULL, balance NUMBER(26,8), created_at TIMESTAMP(6), note VARCHAR2(256))';
exception when others then if sqlcode != -955 then raise; end if; end;
/
begin
 execute immediate 'CREATE TABLE orders (id NUMBER(10) PRIMARY KEY, account_id NUMBER(19) REFERENCES accounts(id), amount NUMBER(12,2))';
exception when others then if sqlcode != -955 then raise; end if; end;
/
MERGE INTO accounts a USING (SELECT 2 id FROM dual) s ON (a.id=s.id)
WHEN NOT MATCHED THEN INSERT VALUES (2,'Northwind',80.25000000,TIMESTAMP '2026-10-08 10:20:30.654321','sample');
MERGE INTO accounts a USING (SELECT 9007199254740993 id FROM dual) s ON (a.id=s.id)
WHEN NOT MATCHED THEN INSERT VALUES (9007199254740993,'Acme',1234567890123456.12345678,TIMESTAMP '2026-10-09 12:34:56.123456',NULL);
MERGE INTO orders a USING (SELECT 1 id FROM dual) s ON (a.id=s.id)
WHEN NOT MATCHED THEN INSERT VALUES (1,2,43.50);
MERGE INTO orders a USING (SELECT 2 id FROM dual) s ON (a.id=s.id)
WHEN NOT MATCHED THEN INSERT VALUES (2,2,19.00);
COMMIT;
SELECT version_full FROM product_component_version;
exit
"""
    seeded = docker("exec", "-i", name, "sqlplus", "-s", "/", "as", "sysdba", input=sql)
    print(seeded.stdout.strip(), flush=True)
    verified = run("openssl", "s_client", "-connect", "127.0.0.1:52484", "-CAfile", str(TLS / "ca.crt"),
                   "-verify_return_error", "-verify_ip", "127.0.0.1", input="", timeout=20)
    if "Verification: OK" not in verified.stdout:
        raise RuntimeError("The Oracle TCPS certificate did not verify.")
    print("Oracle native TCPS, schema, and rows ready.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", action="append", choices=["clickhouse", "mongodb", "sqlite", "oracle"], required=True)
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    saved = credentials()
    for engine in args.engine:
        if engine == "sqlite":
            prepare_sqlite()
        else:
            globals()[f"prepare_{engine}"](saved)
