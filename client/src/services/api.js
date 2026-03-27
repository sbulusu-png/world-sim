const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function getWorldState() {
  return request('/state')
}

export function triggerEvent(payload) {
  return request('/event', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function resetWorld() {
  return request('/reset', { method: 'POST' })
}

export function startSimulation() {
  return request('/simulation/start', { method: 'POST' })
}

export function pauseSimulation() {
  return request('/simulation/pause', { method: 'POST' })
}

export function getSimulationStatus() {
  return request('/simulation/status')
}
