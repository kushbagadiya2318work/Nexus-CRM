import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const distDir = resolve(rootDir, 'dist')
const deployDir = resolve(rootDir, 'vercel-output')

if (!existsSync(distDir)) {
  throw new Error(`Expected Vite output at ${distDir}, but it was not found.`)
}

rmSync(deployDir, { recursive: true, force: true })
mkdirSync(deployDir, { recursive: true })
cpSync(distDir, deployDir, { recursive: true })

console.log(`Prepared Vercel static output in ${deployDir}`)
