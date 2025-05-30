#!/usr/bin/env bun

import createFetchProxy from "../src/index"

async function testProxy() {
  console.log("Testing fetch-proxy library...\n")

  const { proxy } = createFetchProxy({
    base: "https://jsonplaceholder.typicode.com",
    timeout: 10000,
  })

  // Test direct fetch first
  console.log("1. Testing direct fetch...")
  try {
    const directResponse = await fetch(
      "https://jsonplaceholder.typicode.com/users/1",
    )
    console.log(`   Direct fetch status: ${directResponse.status}`)
    const userData = (await directResponse.json()) as any
    console.log(`   User name: ${userData.name}\n`)
  } catch (error) {
    console.error(`   Direct fetch error: ${error}\n`)
  }

  // Test proxy
  console.log("2. Testing proxy...")
  try {
    const req = new Request("http://localhost:3000/test")
    const proxyResponse = await proxy(req, "/users/1")
    console.log(`   Proxy status: ${proxyResponse.status}`)

    if (proxyResponse.ok) {
      const proxyData = (await proxyResponse.json()) as any
      console.log(`   Proxy user name: ${proxyData.name}`)
    } else {
      const errorText = await proxyResponse.text()
      console.log(`   Proxy error: ${errorText}`)
    }
  } catch (error) {
    console.error(`   Proxy error: ${error}`)
  }
}

testProxy().catch(console.error)
