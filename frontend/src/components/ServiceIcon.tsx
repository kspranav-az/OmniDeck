import { Database, FileJson, Zap, Box, HardDrive } from 'lucide-react'

export function ServiceIcon({ service, className }: { service: string; className?: string }) {
  switch (service) {
    case 'postgres':
      return <Database className={className} />
    case 'mongo':
      return <FileJson className={className} />
    case 'redis':
      return <Zap className={className} />
    case 'minio':
      return <Box className={className} />
    default:
      return <HardDrive className={className} />
  }
}
