import { Skeleton } from './ui/Skeleton'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  loading?: boolean
}

export function StatCard({ title, value, subtitle, icon, loading }: StatCardProps) {
  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted">{title}</p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-20" />
        ) : (
          <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
        )}
        {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
    </div>
  )
}
