const ASANA_API_BASE_URL = "https://app.asana.com/api/1.0"

type FetchImplementation = typeof fetch
type SleepImplementation = (milliseconds: number) => Promise<void>

interface AsanaErrorEnvelope {
  errors?: Array<{ message?: string }>
}

interface AsanaPageEnvelope<T> extends AsanaErrorEnvelope {
  data?: T[]
  next_page?: {
    offset?: string | null
  } | null
}

export interface AsanaCollection<T> {
  data: T[]
  truncated: boolean
}

export interface AsanaClientOptions {
  accessToken: string
  fetchImpl?: FetchImplementation
  sleep?: SleepImplementation
  maxRetries?: number
}

export class AsanaApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "AsanaApiError"
  }
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function validatePath(path: string) {
  if (!path.startsWith("/") || path.includes("..") || path.includes("?") || path.includes("#")) {
    throw new Error("Invalid Asana API path")
  }
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, 30_000)
  }
  return Math.min(500 * 2 ** attempt, 10_000)
}

export class AsanaClient {
  private readonly accessToken: string
  private readonly fetchImpl: FetchImplementation
  private readonly sleep: SleepImplementation
  private readonly maxRetries: number

  constructor(options: AsanaClientOptions) {
    const token = options.accessToken.trim()
    if (!token || token.length > 2048) throw new Error("Invalid Asana access token")

    this.accessToken = token
    this.fetchImpl = options.fetchImpl || fetch
    this.sleep = options.sleep || defaultSleep
    this.maxRetries = options.maxRetries ?? 4
  }

  private async requestPage<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined>
  ): Promise<AsanaPageEnvelope<T> & { data: T[] }> {
    validatePath(path)
    const url = new URL(`${ASANA_API_BASE_URL}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      })

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        await this.sleep(retryDelay(response, attempt))
        continue
      }

      let payload: AsanaPageEnvelope<T>
      try {
        payload = await response.json() as AsanaPageEnvelope<T>
      } catch {
        throw new AsanaApiError(response.status, "Asana returned an invalid response")
      }

      if (!response.ok) {
        const apiMessage = payload.errors?.[0]?.message
        throw new AsanaApiError(response.status, apiMessage || `Asana request failed with status ${response.status}`)
      }
      if (!Array.isArray(payload.data)) {
        throw new AsanaApiError(response.status, "Asana response did not contain a collection")
      }

      return { ...payload, data: payload.data }
    }

    throw new AsanaApiError(503, "Asana request retries were exhausted")
  }

  async getCollection<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options: { maxItems?: number; maxPages?: number } = {}
  ): Promise<AsanaCollection<T>> {
    const maxItems = options.maxItems ?? 100_000
    const maxPages = options.maxPages ?? 1_000
    const data: T[] = []
    let offset: string | undefined

    for (let page = 0; page < maxPages; page += 1) {
      const remaining = maxItems - data.length
      if (remaining <= 0) return { data, truncated: true }

      const payload = await this.requestPage<T>(path, {
        ...params,
        limit: Math.min(100, remaining),
        offset,
      })
      data.push(...payload.data)

      const nextOffset = payload.next_page?.offset
      if (!nextOffset) return { data, truncated: false }
      offset = nextOffset
    }

    return { data, truncated: true }
  }

  async getAll<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
    return (await this.getCollection<T>(path, params)).data
  }
}
