export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
    VERIFY: '/verify',
  },
  SRT: {
    SRTS: '/srt/srts',
    SUBTITLES: '/srt/subtitles',
    SUBTITLE_BY_FILENAME: (filename) => `/srt/subtitles/${filename}`,
    SUBTITLE_BY_SEQUENCE: (sequenceNumber) => `/srt/subtitles/${sequenceNumber}`,
  },
  USER: {
    GET_USER_BY_ID: (userId) => `/user/${userId}`
  }
};