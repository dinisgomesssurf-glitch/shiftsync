// React hooks over the API: loading, caching and refreshing in one place.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabaseApi } from './supabaseApi'
import { demoApi } from './demoApi'
import { useToast } from '../ui/Toast'

export const IS_DEMO = typeof window !== 'undefined' && /^\/demo(\/|$)/.test(window.location.pathname)
export const api = IS_DEMO ? demoApi : supabaseApi

/** Who is signed in. status: 'loading' | 'out' | 'in' */
export function useSession() {
  const [state, setState] = useState({ status: 'loading', profile: null })
  const load = useCallback(async user => {
    if (!user) return setState({ status: 'out', profile: null })
    try {
      const profile = await api.getProfile(user)
      if (!profile) { await api.signOut(); return setState({ status: 'out', profile: null }) }
      setState({ status: 'in', profile })
    } catch { setState({ status: 'out', profile: null }) }
  }, [])
  useEffect(() => {
    let last
    const apply = user => { if (user?.id !== last?.id || !user) { last = user; load(user) } }
    api.getSession().then(apply)
    return api.onAuthChange(apply)
  }, [load])
  return state
}

export const AppContext = createContext(null)
/** { profile, orgs, org (current business incl. role), isManager, setOrgId } */
export const useApp = () => useContext(AppContext)

export function useOrgs(userId) {
  return useQuery({ queryKey: ['orgs', userId], queryFn: () => api.listOrgs(userId), enabled: !!userId })
}
export function useOrgData(orgId) {
  return useQuery({ queryKey: ['org', orgId], queryFn: () => api.getOrg(orgId), enabled: !!orgId })
}
export function useWeek(orgId, weekStart) {
  return useQuery({ queryKey: ['week', orgId, weekStart], queryFn: () => api.getWeek(orgId, weekStart), enabled: !!orgId && !!weekStart })
}

/**
 * Runs a change, shows what happened, refreshes what's on screen.
 * const act = useAct(); await act(() => api.addRole(...), { done: 'Role added', refresh: ['org'] })
 */
export function useAct() {
  const qc = useQueryClient()
  const toast = useToast()
  return useCallback(async (fn, { done, refresh = ['org', 'week'] } = {}) => {
    try {
      const result = await fn()
      await Promise.all(refresh.map(key => qc.invalidateQueries({ queryKey: [key] })))
      if (done) toast(done)
      return result ?? true
    } catch (e) {
      toast(e.message === 'stale_version' ? 'Someone else just changed this schedule. Reload and try again.' : e.message, 'error')
      return false
    }
  }, [qc, toast])
}
