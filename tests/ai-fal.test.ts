import { afterEach, describe, expect, it, vi } from 'vitest'

// fal.ai-koppeling zonder netwerk: fetch en de instellingen worden nagebootst.
const saved: { falModel?: string } = {}
vi.mock('../src/main/storage', () => ({
  readSettings: async () => ({ model: 'x', recent: [], ...saved }),
  writeSettings: async (s: { falModel?: string }) => void (saved.falModel = s.falModel)
}))
const { aiCode } = await import('../src/main/ai')

const req = { prompt: 'laadsymbool', banner: { width: 300, height: 600, background: '#fff', colors: [] } }
const answer = { name: 'Loader', width: 80, height: 80, html: '<div class="d"></div>', css: '.root .d{animation:kf-a 1s infinite}', explanation: 'Draait.' }
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, statusText: 'x', json: async () => body })

afterEach(() => vi.unstubAllGlobals())

describe('AI via fal.ai', () => {
  it('probeert een ander model als het gekozen model niet bestaat, en onthoudt dat', async () => {
    const models: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      const m = JSON.parse(init.body).model
      models.push(m)
      if (m === 'anthropic/claude-3.7-sonnet')
        return reply(404, { detail: "Error code: 404 - {'error': {'message': 'No endpoints found for anthropic/claude-3.7-sonnet'}}" })
      return reply(200, { output: 'Hier is het:\n```json\n' + JSON.stringify(answer) + '\n```' })
    })
    const res = await aiCode('fal', 'key', 'anthropic/claude-3.7-sonnet', req)
    expect(res.name).toBe('Loader')
    expect(models).toEqual(['anthropic/claude-3.7-sonnet', 'anthropic/claude-sonnet-4.5'])
    expect(saved.falModel).toBe('anthropic/claude-sonnet-4.5')
  })

  it('geeft een duidelijke melding bij een verkeerde sleutel', async () => {
    vi.stubGlobal('fetch', async () => reply(401, { detail: 'Unauthorized' }))
    await expect(aiCode('fal', 'key', 'anthropic/claude-sonnet-4.5', req)).rejects.toThrow(/weigert de sleutel/)
  })
})
