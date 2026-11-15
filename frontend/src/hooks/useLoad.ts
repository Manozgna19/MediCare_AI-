import { DependencyList, useCallback, useEffect, useState } from 'react'

/** Fetch-on-mount helper with loading/error state and manual reload. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    setLoading(true)
    return fn().then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, deps)
  useEffect(() => { run() }, [run])
  return { data, setData, error, loading, reload: run }
}
