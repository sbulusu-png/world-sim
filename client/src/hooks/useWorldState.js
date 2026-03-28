import { useState, useCallback, useEffect, useRef } from 'react'
import {
  getWorldState,
  triggerEvent as apiTriggerEvent,
  resetWorld as apiResetWorld,
  startSimulation as apiStart,
  pauseSimulation as apiPause,
} from '../services/api'

/**
 * Normalizes the nations array from the backend into a lookup map.
 * Also builds alliances as a set for fast membership checks.
 */
function normalizeWorld(raw) {
  if (!raw || !raw.nations) return null
  const nationMap = {}
  for (const n of raw.nations) {
    nationMap[n.id] = n
  }
  return { ...raw, nationMap }
}

export function useWorldState() {
  const [worldState, setWorldState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [turnSummary, setTurnSummary] = useState(null)
  const [simRunning, setSimRunning] = useState(false)
  const [debugStats, setDebugStats] = useState(null)
  const pollRef = useRef(null)

  const refreshState = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await getWorldState()
      console.log('[DEBUG refreshState] raw.lastTurnSummary:', raw.lastTurnSummary ? `PRESENT (turn ${raw.lastTurnSummary.turn}, ${raw.lastTurnSummary.reactions?.length} reactions)` : 'NULL')
      if (raw.debug) {
        console.log('[DEBUG refreshState] AI stats:', JSON.stringify(raw.debug))
        setDebugStats(raw.debug)
      }
      setWorldState(normalizeWorld(raw))
      if (raw.lastTurnSummary) {
        setTurnSummary(raw.lastTurnSummary)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Silent refresh — no loading spinner, for polling
  const silentRefresh = useCallback(async () => {
    try {
      const raw = await getWorldState()
      console.log('[DEBUG silentRefresh] raw.lastTurnSummary:', raw.lastTurnSummary ? `PRESENT (turn ${raw.lastTurnSummary.turn}, ${raw.lastTurnSummary.reactions?.length} reactions)` : 'NULL')
      if (raw.debug) {
        setDebugStats(raw.debug)
      }
      setWorldState(normalizeWorld(raw))
      if (raw.lastTurnSummary) {
        setTurnSummary(raw.lastTurnSummary)
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [])

  const triggerEvent = useCallback(async (payload) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiTriggerEvent(payload)
      // Use the world state returned directly in the response (avoids extra round-trip)
      if (result.world) {
        setWorldState(normalizeWorld(result.world))
      } else {
        await refreshState()
      }
      // Store turn summary with AI reactions
      if (result.turnSummary) {
        setTurnSummary(result.turnSummary)
      }
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [refreshState])

  const resetSimulation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiResetWorld()
      if (result.world) {
        setWorldState(normalizeWorld(result.world))
      }
      setTurnSummary(null)
      setSimRunning(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const startSim = useCallback(async () => {
    try {
      const result = await apiStart()
      setSimRunning(result.running)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const pauseSim = useCallback(async () => {
    try {
      const result = await apiPause()
      setSimRunning(result.running)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  // Poll for state updates while simulation is running (every 2s)
  useEffect(() => {
    if (simRunning) {
      pollRef.current = setInterval(silentRefresh, 2000)
    } else {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => clearInterval(pollRef.current)
  }, [simRunning, silentRefresh])

  return { worldState, loading, error, turnSummary, simRunning, debugStats, refreshState, triggerEvent, resetSimulation, startSim, pauseSim }
}
