/**
 * 工具函数模块
 * 提供URL解析、时间格式化、API请求等通用功能
 */

// 使用命名空间
window.BilibiliSubtitle = window.BilibiliSubtitle || {}

/**
 * 获取本地化文案
 */
window.BilibiliSubtitle.getMessage = function(key, fallback) {
  try {
    if (window.chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const message = chrome.i18n.getMessage(key)
      return message || fallback || ''
    }
  } catch (error) {
    return fallback || ''
  }

  return fallback || ''
}


window.BilibiliSubtitle.isCheesePage = function() {
  return window.location.pathname.startsWith('/cheese/play/')
}

window.BilibiliSubtitle.getCheeseEpisodeId = function() {
  const match = window.location.pathname.match(/\/cheese\/play\/(ep\d+|ss\d+)/)
  return match ? match[1] : ''
}

window.BilibiliSubtitle.getCheeseIdInfo = function() {
  const id = window.BilibiliSubtitle.getCheeseEpisodeId()
  const match = id.match(/^(ep|ss)(\d+)$/)
  if (!match) return { id: '', type: '', value: null }

  return {
    id,
    type: match[1],
    value: Number(match[2])
  }
}

function extractJsonObject(source, startIndex) {
  const objectStart = source.indexOf('{', startIndex)
  if (objectStart === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = objectStart; index < source.length; index++) {
    const char = source[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth++
    if (char === '}') depth--
    if (depth === 0) return source.slice(objectStart, index + 1)
  }

  return null
}

window.BilibiliSubtitle.getInitialState = function() {
  const scripts = Array.from(document.scripts || [])
  for (const script of scripts) {
    const text = script.textContent || ''
    const stateIndex = text.indexOf('__INITIAL_STATE__')
    if (stateIndex === -1) continue

    const jsonText = extractJsonObject(text, stateIndex)
    if (!jsonText) continue

    try {
      return JSON.parse(jsonText)
    } catch (error) {
      window.BilibiliSubtitle.logDebug('[API] 解析INITIAL_STATE失败:', error)
    }
  }

  return null
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const num = Number(value.trim())
    return Number.isFinite(num) ? num : null
  }
  return null
}

function findVideoInfoCandidate(value, visited = new Set()) {
  if (!value || typeof value !== 'object') return null
  if (visited.has(value)) return null
  visited.add(value)

  const aid = parseFiniteNumber(value.aid) || parseFiniteNumber(value.aid_str)
  const cid = parseFiniteNumber(value.cid)
  if (aid && cid) {
    return {
      aid,
      cid,
      bvid: value.bvid || value.bv_id || value.bvId || '',
      title: value.title || value.part || value.ep_title || value.long_title || ''
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findVideoInfoCandidate(item, visited)
      if (candidate) return candidate
    }
    return null
  }

  for (const item of Object.values(value)) {
    const candidate = findVideoInfoCandidate(item, visited)
    if (candidate) return candidate
  }

  return null
}

window.BilibiliSubtitle.getVideoInfoFromPageState = function() {
  const initialState = window.BilibiliSubtitle.getInitialState()
  return findVideoInfoCandidate(initialState)
}

window.BilibiliSubtitle.getDanmukuBox = function() {
  return document.getElementById('danmukuBox') ||
    document.querySelector('.right-container') ||
    document.querySelector('.bpx-player-container')?.parentElement ||
    document.querySelector('#app')
}

/**
 * 从当前页面URL中提取BVID
 */
window.BilibiliSubtitle.getBVID = function() {
  if (window.location.pathname === '/list/watchlater') {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('bvid')
  }

  const urlParams = new URLSearchParams(window.location.search)
  const bvidFromQuery = urlParams.get('bvid')
  if (bvidFromQuery) return bvidFromQuery

  const bvidFromPath = window.location.pathname.match(/BV[0-9A-Za-z]+/)
  if (bvidFromPath) return bvidFromPath[0]

  const pageVideoInfo = window.BilibiliSubtitle.getVideoInfoFromPageState()
  if (pageVideoInfo?.bvid) return pageVideoInfo.bvid

  return ''
}

window.BilibiliSubtitle.getVideoKey = function() {
  const bvid = window.BilibiliSubtitle.getBVID()
  const page = window.BilibiliSubtitle.getPageNumber()
  if (bvid) return `${bvid}-p${page}`

  const cheeseEpisodeId = window.BilibiliSubtitle.getCheeseEpisodeId()
  if (cheeseEpisodeId) return `cheese-${cheeseEpisodeId}`

  return window.location.href
}

/**
 * 从当前页面URL中提取分P编号
 */
window.BilibiliSubtitle.getPageNumber = function() {
  const urlParams = new URLSearchParams(window.location.search)
  const page = parseInt(urlParams.get('p') || '1', 10)
  return Number.isNaN(page) ? 1 : page
}

/**
 * 将秒数格式化为 MM:SS 格式
 */
window.BilibiliSubtitle.formatTime = function(seconds) {
  const roundedSeconds = Math.round(seconds)
  const minutes = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * 跳转到指定时间
 */
window.BilibiliSubtitle.jumpToTime = function(seconds) {
  const video = document.querySelector('video')
  if (video) {
    video.currentTime = seconds
  }
}

/**
 * 通过API获取视频信息
 */
window.BilibiliSubtitle.fetchVideoInfoByAPI = async function(bvid) {
  try {
    const page = window.BilibiliSubtitle.getPageNumber()
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}&p=${page}`, {
      credentials: 'include'
    })
    if (!response.ok) throw new Error('获取视频信息失败')
    const data = await response.json()
    const videoData = data.data

    // 分P时用pages里的cid，避免总是拿到P1
    if (videoData?.pages && videoData.pages.length > 0) {
      const pageIndex = Math.max(page - 1, 0)
      const pageInfo = videoData.pages[pageIndex]
      if (pageInfo) {
        videoData.cid = pageInfo.cid
        videoData.title = pageInfo.part || videoData.title
      }
    }

    return videoData
  } catch (error) {
    window.BilibiliSubtitle.logError('[API方法] 获取视频信息失败:', error)
    throw error
  }
}


window.BilibiliSubtitle.fetchCurrentVideoInfoByAPI = async function() {
  if (window.BilibiliSubtitle.isCheesePage()) {
    const pageVideoInfo = window.BilibiliSubtitle.getVideoInfoFromPageState()
    if (pageVideoInfo?.aid && pageVideoInfo?.cid) {
      return pageVideoInfo
    }

    return window.BilibiliSubtitle.fetchCheeseVideoInfoByAPI()
  }

  const bvid = window.BilibiliSubtitle.getBVID()
  if (bvid) {
    return window.BilibiliSubtitle.fetchVideoInfoByAPI(bvid)
  }

  throw new Error('无法获取视频信息')
}

window.BilibiliSubtitle.fetchCheeseVideoInfoByAPI = async function() {
  const cheeseIdInfo = window.BilibiliSubtitle.getCheeseIdInfo()
  if (!cheeseIdInfo.value) throw new Error('无法获取课程ID')

  const params = new URLSearchParams()
  if (cheeseIdInfo.type === 'ep') {
    params.set('ep_id', String(cheeseIdInfo.value))
  } else if (cheeseIdInfo.type === 'ss') {
    params.set('season_id', String(cheeseIdInfo.value))
  }

  const response = await fetch(`https://api.bilibili.com/pugv/view/web/season?${params.toString()}`, {
    credentials: 'include'
  })
  if (!response.ok) throw new Error('获取课程信息失败')

  const data = await response.json()
  if (data.code !== 0 || !data.data) {
    throw new Error(data.message || '获取课程信息失败')
  }

  const sections = Array.isArray(data.data.sections) ? data.data.sections : []
  const sectionEpisodes = sections.flatMap((section) => section.episodes || [])
  const episodes = data.data.episodes || data.data.section?.episodes || sectionEpisodes || []
  const selectedEpisode = episodes.find((episode) => {
    const episodeId = parseFiniteNumber(episode.id) || parseFiniteNumber(episode.ep_id)
    return cheeseIdInfo.type !== 'ep' || episodeId === cheeseIdInfo.value
  }) || episodes[0] || data.data

  const aid = parseFiniteNumber(selectedEpisode.aid) || parseFiniteNumber(selectedEpisode.avid)
  const cid = parseFiniteNumber(selectedEpisode.cid)
  if (!aid || !cid) throw new Error('课程信息中缺少aid/cid')

  return {
    aid,
    cid,
    bvid: selectedEpisode.bvid || selectedEpisode.bv_id || '',
    title: selectedEpisode.title || selectedEpisode.long_title || data.data.title || '',
    subtitle: selectedEpisode.subtitle || data.data.subtitle
  }
}

/**
 * 通过API获取字幕列表
 */
window.BilibiliSubtitle.fetchSubtitleListByAPI = async function(aid, cid, bvid) {
  const apis = [
    `https://api.bilibili.com/x/player/v2?aid=${aid}&cid=${cid}`,
    `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`
  ]

  if (bvid) {
    apis.unshift(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`)
  }

  let lastError = null
  const collectedSubtitles = []
  for (const api of apis) {
    try {
      window.BilibiliSubtitle.logDebug('[API方法] 尝试获取字幕列表:', api)
      const response = await fetch(api, {
        credentials: 'include'
      })
      if (!response.ok) throw new Error('获取字幕列表失败')
      const data = await response.json()
      const subtitles = data?.data?.subtitle?.subtitles || data?.data?.subtitle?.list
      if (Array.isArray(subtitles)) {
        collectedSubtitles.push(...subtitles)
      } else {
        lastError = new Error(data?.message || '字幕列表为空')
      }
    } catch (error) {
      lastError = error
      window.BilibiliSubtitle.logDebug('[API方法] 字幕列表接口失败:', api, error)
    }
  }

  if (collectedSubtitles.length > 0) {
    return collectedSubtitles
  }

  window.BilibiliSubtitle.logError('[API方法] 获取字幕列表失败:', lastError)
  throw lastError || new Error('获取字幕列表失败')
}

/**
 * 通过API获取字幕内容
 * 注意：不使用credentials: 'include'以避免CORS问题
 */
function buildSubtitleUrlCandidates(subtitleUrl) {
  const candidates = []
  const addCandidate = (url) => {
    if (url && !candidates.includes(url)) candidates.push(url)
  }

  addCandidate(subtitleUrl)

  try {
    addCandidate(decodeURIComponent(subtitleUrl))
  } catch (error) {
    window.BilibiliSubtitle.logDebug('[API方法] 字幕URL解码失败:', error)
  }

  for (const url of [...candidates]) {
    if (url.startsWith('//')) {
      addCandidate(`https:${url}`)
      addCandidate(`http:${url}`)
    } else if (url.startsWith('http://')) {
      addCandidate(url.replace(/^http:\/\//, 'https://'))
    } else if (url.startsWith('https://')) {
      addCandidate(url.replace(/^https:\/\//, 'http://'))
    }
  }

  return candidates.filter((url) => url.startsWith('http://') || url.startsWith('https://'))
}

/**
 * 通过API获取字幕内容
 * 注意：不使用credentials: 'include'以避免CORS问题
 */
window.BilibiliSubtitle.fetchSubtitleContentByAPI = async function(subtitleUrl) {
  const candidates = buildSubtitleUrlCandidates(subtitleUrl)
  let lastError = null

  for (const url of candidates) {
    try {
      window.BilibiliSubtitle.logDebug('[API方法] 尝试获取字幕内容:', url)
      const response = await fetch(url, {
        credentials: 'omit'
      })
      if (!response.ok) throw new Error(`获取字幕内容失败: HTTP ${response.status}`)

      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()
      if (!contentType.includes('json') && text.trim().startsWith('<')) {
        throw new Error('字幕地址返回HTML页面')
      }

      const data = JSON.parse(text)
      if (Array.isArray(data.body)) return data.body
      if (Array.isArray(data)) return data
      throw new Error('字幕JSON中缺少body')
    } catch (error) {
      lastError = error
      window.BilibiliSubtitle.logDebug('[API方法] 字幕内容接口失败:', url, error)
    }
  }

  window.BilibiliSubtitle.logError('[API方法] 获取字幕内容失败:', lastError, {
    subtitleUrl,
    candidates
  })
  throw lastError || new Error('获取字幕内容失败')
}
