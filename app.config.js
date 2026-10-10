/**
 * app.json 을 그대로 쓰되, 웹 base URL 만 빌드할 때 정한다.
 *
 *   Cloudflare Pages  : 사이트 루트에서 서비스 → baseUrl 없음 (기본)
 *   GitHub Pages      : /hanoid/ 하위에서 서비스 → EXPO_BASE_URL=/hanoid 로 빌드
 *
 * 예) GitHub Pages 용 빌드
 *     EXPO_BASE_URL=/hanoid npx expo export -p web
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL || '';
  return {
    ...config,
    experiments: { ...(config.experiments ?? {}), ...(baseUrl ? { baseUrl } : {}) },
  };
};
