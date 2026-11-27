export function isProductionDeploymentOrigin(origin: string): boolean {
  return /^https:\/\/modern-backend(?:-lab)?-[a-z0-9]{9}-(?:zznam|zznams-projects)\.vercel\.app$/.test(origin)
    && origin === new URL(origin).origin;
}
