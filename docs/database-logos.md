# Database logos

The connection picker uses the six PNG assets in `apps/web/public/database-icons`.
The sidebar and saved connection cards use the same assets.

The [asset manifest](database-logo-assets.json) records the source URL, retrieval date, source hash, output hash, dimensions, and conversion.
All six sources were retrieved on 9 October 2026.

| Database   | Asset source                                                                  | Source evidence                                                                                                            |
| ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | [Elephant PNG](https://www.postgresql.org/media/img/about/press/elephant.png) | PostgreSQL press assets                                                                                                    |
| MySQL      | [Organization avatar](https://avatars.githubusercontent.com/u/2452804?v=4)    | [MySQL organization record](https://api.github.com/orgs/mysql) identifies Oracle Corporation and links to `dev.mysql.com`. |
| ClickHouse | [Site icon](https://clickhouse.com/icon1.png)                                 | The ClickHouse homepage links to this PNG.                                                                                 |
| MongoDB    | [Organization avatar](https://avatars.githubusercontent.com/u/45120?v=4)      | [MongoDB organization record](https://api.github.com/orgs/mongodb) links to `mongodb.com`.                                 |
| SQLite     | [SQLite banner](https://sqlite.org/images/sqlite370_banner.svg)               | The SQLite homepage links to this SVG.                                                                                     |
| Oracle     | [Site icon](https://www.oracle.com/asset/web/favicons/favicon-192.png)        | Oracle serves this PNG from its website.                                                                                   |

Sharp 0.35.5 converted the sources on the Linux build host.
Each output fits inside 256 by 256 pixels.
Conversion preserves the source aspect ratio and colors.
It does not enlarge small sources.
The MongoDB source is JPEG, and the SQLite source is SVG. Their outputs are PNG.

The database names and logos belong to their respective owners.
This repository's Apache-2.0 license does not grant rights to those marks.
The images identify connection types. They do not imply endorsement by a database vendor.

The main SyneHQ catalog informed the logo placement.
Its private source revision is `664256bb66f54a3dbec912efae6f7fdbdf44fc8b`.
Its source path is `src/app/data-sources/connections/components/connection-form/catalog.tsx`.
This extraction uses the official sources above in place of unavailable links and third-party thumbnails.

The [connection form record](connection-form-source.md) describes the reused flow.
