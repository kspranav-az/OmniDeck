import type { Credentials } from './api'

export const SERVICE_COLORS: Record<string, string> = {
  postgres: '#3B82F6',
  mongo: '#22C55E',
  redis: '#EF4444',
  minio: '#F59E0B',
}

export const SERVICE_DOCS: Record<string, string> = {
  postgres: '#docs-postgres',
  mongo: '#docs-mongo',
  redis: '#docs-redis',
  minio: '#docs-minio',
}

export function getConnectionString(service: string, creds: Credentials): string {
  switch (service) {
    case 'postgres':
      return `postgresql://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${creds.database}`
    case 'mongo':
      return `mongodb://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${creds.database}?authSource=${creds.database}`
    case 'redis':
      return `redis://${creds.user}:${creds.password}@${creds.host}:${creds.port}/0`
    case 'minio':
      return `http://${creds.host}:${creds.port}`
    default:
      return ''
  }
}

export function getSnippets(service: string, creds: Credentials) {
  const postgresConn = getConnectionString('postgres', creds)
  const mongoConn = getConnectionString('mongo', creds)
  const redisConn = getConnectionString('redis', creds)
  const minioEndpoint = `http://${creds.host}:${creds.port}`

  switch (service) {
    case 'postgres':
      return {
        Python: `import psycopg

conn = psycopg.connect("${postgresConn}")
cur = conn.cursor()
cur.execute("SELECT 1")
print(cur.fetchone())
cur.close()
conn.close()`,
        'Node.js': `const { Client } = require('pg')

const client = new Client({
  connectionString: '${postgresConn}'
})
await client.connect()
const res = await client.query('SELECT 1')
console.log(res.rows[0])
await client.end()`,
        Go: `package main

import (
  "database/sql"
  _ "github.com/lib/pq"
)

func main() {
  db, _ := sql.Open("postgres", "${postgresConn}")
  defer db.Close()
  db.Ping()
}`,
        curl: `# PostgreSQL is not HTTP; use psql:
psql "${postgresConn}" -c "SELECT 1";`,
      }
    case 'mongo':
      return {
        Python: `from pymongo import MongoClient

client = MongoClient("${mongoConn}")
db = client["${creds.database}"]
print(db.command("ping"))
client.close()`,
        'Node.js': `const { MongoClient } = require('mongodb')

const client = new MongoClient('${mongoConn}')
await client.connect()
const db = client.db('${creds.database}')
console.log(await db.command({ ping: 1 }))
await client.close()`,
        Go: `package main

import (
  "context"
  "go.mongodb.org/mongo-driver/mongo"
  "go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
  client, _ := mongo.Connect(context.TODO(), options.Client().ApplyURI("${mongoConn}"))
  defer client.Disconnect(context.TODO())
}`,
        curl: `# MongoDB uses its own protocol; use mongosh:
mongosh "${mongoConn}" --eval "db.runCommand({ping:1})"`,
      }
    case 'redis':
      return {
        Python: `import redis

r = redis.Redis.from_url("${redisConn}")
print(r.ping())
r.close()`,
        'Node.js': `const redis = require('redis')

const client = redis.createClient({ url: '${redisConn}' })
await client.connect()
console.log(await client.ping())
await client.quit()`,
        Go: `package main

import (
  "github.com/redis/go-redis/v9"
)

func main() {
  rdb := redis.NewClient(&redis.Options{
    Addr: "${creds.host}:${creds.port}",
    Username: "${creds.user}",
    Password: "${creds.password}",
  })
  _ = rdb.Ping(ctx)
}`,
        curl: `redis-cli -u ${redisConn} PING`,
      }
    case 'minio':
      return {
        Python: `from minio import Minio

client = Minio("${creds.host}:${creds.port}",
    access_key="${creds.access_key}",
    secret_key="${creds.secret_key}",
    secure=False)
print(client.bucket_exists("${creds.bucket}"))`,
        'Node.js': `const { Client } = require('minio')

const minioClient = new Client({
  endPoint: '${creds.host}',
  port: ${creds.port},
  useSSL: false,
  accessKey: '${creds.access_key}',
  secretKey: '${creds.secret_key}'
})
const exists = await minioClient.bucketExists('${creds.bucket}')
console.log(exists)`,
        Go: `package main

import (
  "github.com/minio/minio-go/v7"
)

func main() {
  client, _ := minio.New("${creds.host}:${creds.port}", &minio.Options{
    Creds: credentials.NewStaticV4("${creds.access_key}", "${creds.secret_key}", ""),
    Secure: false,
  })
  client.BucketExists(ctx, "${creds.bucket}")
}`,
        curl: `# List buckets with S3-style API
curl ${minioEndpoint} -H "Authorization: Bearer ..."`,
      }
    default:
      return {}
  }
}
