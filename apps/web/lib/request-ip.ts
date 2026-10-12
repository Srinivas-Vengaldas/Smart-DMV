import { headers } from "next/headers"

export async function getRequestIp() {
  const headerStore = await headers()

  const forwardedFor = headerStore.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "Unknown"
  }

  const realIp = headerStore.get("x-real-ip")
  if (realIp) {
    return realIp
  }

  return "Unknown"
}