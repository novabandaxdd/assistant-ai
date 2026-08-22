/**
 * ── Project Parser ────────────────────────────────────────────────────────────
 * Reads a set of project files and extracts structured information:
 *   • Stack detection (Java/Spring, React, Angular, Vue, Node, Python, .NET, Flutter)
 *   • Module discovery (controllers, services, components, pages, hooks…)
 *   • Endpoint extraction (REST routes, Spring mappings)
 *   • Feature inference (auth, CRUD, payments, notifications…)
 *   • Dependency analysis (package.json, pom.xml, build.gradle, requirements.txt…)
 */

import type {
  ParsedFile,
  DetectedStack,
  ParsedModule,
  ParsedEndpoint,
  ParsedFeature,
  ParsedProject,
  ProjectStack,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Files/dirs to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage',
  '__pycache__', '.venv', 'venv', 'env', '.gradle', '.idea', '.vscode',
  'target', 'bin', 'obj', '.dart_tool', 'pods', 'xcodeproj', 'migrations',
  '.pub-cache', 'Pods', 'android', 'ios',
])

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.mp3', '.mp4', '.wav', '.ogg', '.woff', '.woff2', '.ttf', '.eot',
  '.lock', '.sum', '.min.js', '.min.css', '.map',
  '.zip', '.tar', '.gz', '.jar', '.war', '.class',
  '.DS_Store', '.env.local', '.env.production',
])

// Max bytes to read per file (to avoid memory issues with huge source files)
const MAX_FILE_BYTES = 80_000

// ─────────────────────────────────────────────────────────────────────────────
// File reading helpers (browser FileSystemEntry / FileSystemFileEntry API)
// ─────────────────────────────────────────────────────────────────────────────

function shouldSkip(name: string): boolean {
  if (SKIP_DIRS.has(name)) return true
  const lower = name.toLowerCase()
  return SKIP_EXTS.has(lower.slice(lower.lastIndexOf('.'))) ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.map')
}

async function readFileEntry(entry: FileSystemFileEntry): Promise<ParsedFile | null> {
  return new Promise(resolve => {
    entry.file(file => {
      if (file.size > MAX_FILE_BYTES * 3) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = ev => {
        const raw = (ev.target?.result as string) ?? ''
        resolve({
          path: entry.fullPath,
          name: entry.name,
          content: raw.slice(0, MAX_FILE_BYTES),
          size: file.size,
        })
      }
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }, () => resolve(null))
  })
}

async function traverseEntry(
  entry: FileSystemEntry,
  results: ParsedFile[],
  depth = 0,
): Promise<void> {
  if (depth > 12) return
  if (shouldSkip(entry.name)) return

  if (entry.isFile) {
    const f = await readFileEntry(entry as FileSystemFileEntry)
    if (f) results.push(f)
  } else if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const reader = dir.createReader()
    await new Promise<void>(resolve => {
      reader.readEntries(async entries => {
        for (const e of entries) {
          await traverseEntry(e, results, depth + 1)
        }
        resolve()
      }, () => resolve())
    })
  }
}

/**
 * Read all files from a DataTransfer drop (folder or multiple files).
 */
export async function readDroppedFiles(
  dataTransfer: DataTransfer,
  onProgress?: (count: number) => void,
): Promise<ParsedFile[]> {
  const results: ParsedFile[] = []
  const items = Array.from(dataTransfer.items)

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.()
    if (!entry) continue
    await traverseEntry(entry, results)
    onProgress?.(results.length)
  }

  return results
}

/**
 * Read files from a standard <input type="file" webkitdirectory> selection.
 */
export async function readInputFiles(
  fileList: FileList,
  onProgress?: (count: number) => void,
): Promise<ParsedFile[]> {
  const results: ParsedFile[] = []
  const files = Array.from(fileList)

  for (const file of files) {
    if (shouldSkip(file.name)) continue
    if (file.size > MAX_FILE_BYTES * 3) continue

    await new Promise<void>(resolve => {
      const reader = new FileReader()
      reader.onload = ev => {
        const raw = (ev.target?.result as string) ?? ''
        results.push({
          path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          name: file.name,
          content: raw.slice(0, MAX_FILE_BYTES),
          size: file.size,
        })
        onProgress?.(results.length)
        resolve()
      }
      reader.onerror = () => resolve()
      reader.readAsText(file)
    })
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack detection
// ─────────────────────────────────────────────────────────────────────────────

interface StackSignal {
  stack: ProjectStack
  weight: number
}

function detectStack(files: ParsedFile[]): DetectedStack {
  const scores = new Map<ProjectStack, number>()
  const add = (s: ProjectStack, w: number) => scores.set(s, (scores.get(s) ?? 0) + w)

  const fileNames = files.map(f => f.name.toLowerCase())
  const allPaths  = files.map(f => f.path.toLowerCase()).join('\n')

  // Config file signals
  const hasFile = (n: string) => fileNames.includes(n.toLowerCase())
  const hasPath = (p: string) => allPaths.includes(p.toLowerCase())

  // Java / Spring
  if (hasFile('pom.xml') || hasFile('build.gradle') || hasFile('build.gradle.kts')) {
    add('java', 8)
    const pomContent = files.find(f => f.name === 'pom.xml')?.content ?? ''
    const gradleContent = files.find(f => f.name.includes('build.gradle'))?.content ?? ''
    if (pomContent.includes('spring') || gradleContent.includes('spring')) add('spring', 10)
    if (hasPath('src/main/java') || hasPath('src/main/kotlin')) add('java', 5)
  }

  // Node / React / Angular / Vue
  const pkgFile = files.find(f => f.name === 'package.json' && !f.path.includes('node_modules'))
  if (pkgFile) {
    add('node', 6)
    const pkg = safeParseJSON(pkgFile.content) as Record<string, unknown>
    const allDeps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    }
    const deps = Object.keys(allDeps)
    if (deps.includes('react') || deps.includes('react-dom')) add('react', 10)
    if (deps.includes('@angular/core')) add('angular', 10)
    if (deps.includes('vue')) add('vue', 10)
    if (deps.includes('next')) add('react', 4)
    if (deps.includes('nuxt')) add('vue', 4)
    if (deps.includes('express') || deps.includes('fastify') || deps.includes('koa')) add('node', 6)
    if (deps.includes('nestjs') || deps.includes('@nestjs/core')) { add('node', 8); add('spring', 2) }
  }

  // Python
  if (hasFile('requirements.txt') || hasFile('setup.py') || hasFile('pyproject.toml') || hasFile('manage.py')) {
    add('python', 8)
  }

  // .NET
  if (files.some(f => f.name.endsWith('.csproj') || f.name.endsWith('.sln'))) {
    add('dotnet', 8)
  }

  // Flutter / Dart
  if (hasFile('pubspec.yaml')) {
    add('flutter', 8)
    const pub = files.find(f => f.name === 'pubspec.yaml')?.content ?? ''
    if (pub.includes('flutter')) add('flutter', 6)
  }

  // File-extension signals
  const extCounts: Record<string, number> = {}
  for (const f of files) {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    extCounts[ext] = (extCounts[ext] ?? 0) + 1
  }
  if ((extCounts['.java'] ?? 0) > 3) add('java', 5)
  if ((extCounts['.py'] ?? 0) > 3) add('python', 5)
  if ((extCounts['.cs'] ?? 0) > 3) add('dotnet', 5)
  if ((extCounts['.dart'] ?? 0) > 3) add('flutter', 5)
  if ((extCounts['.ts'] ?? 0) + (extCounts['.tsx'] ?? 0) > 3) add('node', 2)

  // Content-level signals
  for (const f of files.slice(0, 80)) {
    const c = f.content
    if (c.includes('@SpringBootApplication') || c.includes('@RestController') || c.includes('@Service')) add('spring', 3)
    if (c.includes('import React') || c.includes('from \'react\'') || c.includes('from "react"')) add('react', 2)
    if (c.includes('@Component({') || c.includes('@NgModule({')) add('angular', 3)
    if (c.includes('createApp(') || c.includes('defineComponent(')) add('vue', 3)
    if (c.includes('import express') || c.includes('fastify(') || c.includes('@Module({')) add('node', 2)
    if (c.includes('import django') || c.includes('from flask') || c.includes('FastAPI(')) add('python', 2)
  }

  // Build result
  const sorted: StackSignal[] = Array.from(scores.entries())
    .map(([stack, weight]) => ({ stack, weight }))
    .sort((a, b) => b.weight - a.weight)

  const primary: ProjectStack = sorted[0]?.stack ?? 'generic'
  const secondary = sorted.slice(1, 4).filter(s => s.weight >= 3).map(s => s.stack)
  const totalWeight = sorted.reduce((s, x) => s + x.weight, 0)
  const confidence = Math.min(100, Math.round(((sorted[0]?.weight ?? 0) / Math.max(totalWeight, 1)) * 100))

  const stackLabels: Record<ProjectStack, string> = {
    java: 'Java', spring: 'Spring Boot', react: 'React', angular: 'Angular',
    vue: 'Vue.js', node: 'Node.js', python: 'Python', dotnet: '.NET', flutter: 'Flutter', generic: 'Generic',
  }

  return {
    primary,
    secondary,
    confidence,
    details: `${stackLabels[primary]}${secondary.length ? ' + ' + secondary.map(s => stackLabels[s]).join(', ') : ''}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractModules(files: ParsedFile[], stack: DetectedStack): ParsedModule[] {
  const modules: ParsedModule[] = []

  for (const file of files) {
    const name = file.name.toLowerCase()
    const path = file.path.toLowerCase()
    const content = file.content

    // Determine module type based on naming + content
    let type: ParsedModule['type'] = 'generic'
    let description = ''
    const dependencies: string[] = []
    const endpoints: ParsedEndpoint[] = []

    // ── Spring / Java
    if (stack.primary === 'java' || stack.primary === 'spring') {
      if (content.includes('@RestController') || content.includes('@Controller')) {
        type = 'controller'
        description = extractJavaClassDescription(content, 'Controller')
        endpoints.push(...extractSpringEndpoints(content, file.path))
      } else if (content.includes('@Service')) {
        type = 'service'
        description = extractJavaClassDescription(content, 'Service')
      } else if (content.includes('@Repository') || content.includes('extends JpaRepository') || content.includes('extends CrudRepository')) {
        type = 'repository'
        description = extractJavaClassDescription(content, 'Repository')
      } else if (content.includes('@Entity') || content.includes('@Table(')) {
        type = 'model'
        description = extractJavaClassDescription(content, 'Entity')
      } else if (content.includes('@Configuration') || content.includes('@SpringBootApplication')) {
        type = 'config'
        description = extractJavaClassDescription(content, 'Config')
      } else if (!file.name.endsWith('.java') && !file.name.endsWith('.kt')) {
        continue
      }
      // Extract Spring @Autowired / @Inject dependencies
      const autowiredMatches = content.matchAll(/@Autowired[\s\S]*?private\s+\w+\s+(\w+)/g)
      for (const m of autowiredMatches) dependencies.push(m[1])
    }

    // ── React / Vue
    else if (stack.primary === 'react' || stack.secondary.includes('react')) {
      if (!file.name.match(/\.(tsx?|jsx?)$/)) continue
      if (name.includes('page') || path.includes('/pages/') || path.includes('/app/') || path.includes('/routes/')) {
        type = 'page'
        description = `Page: ${cleanComponentName(file.name)}`
      } else if (name.includes('hook') || name.startsWith('use')) {
        type = 'hook'
        description = `Custom hook: ${cleanComponentName(file.name)}`
      } else if (name.includes('context') || name.includes('provider')) {
        type = 'module'
        description = `Context provider: ${cleanComponentName(file.name)}`
      } else if (name.includes('service') || name.includes('api') || name.includes('client')) {
        type = 'service'
        description = `Service/API: ${cleanComponentName(file.name)}`
      } else if (name.includes('store') || name.includes('slice') || name.includes('reducer')) {
        type = 'module'
        description = `State store: ${cleanComponentName(file.name)}`
      } else if (name.includes('util') || name.includes('helper') || name.includes('lib')) {
        type = 'util'
        description = `Utility: ${cleanComponentName(file.name)}`
      } else if (content.includes('export default function') || content.includes('export const') || content.includes('= () =>')) {
        type = 'component'
        description = `Component: ${cleanComponentName(file.name)}`
      } else {
        continue
      }
      // Extract imports as dependencies
      const importMatches = content.matchAll(/import .+ from ['"]([^'"]+)['"]/g)
      for (const m of importMatches) {
        if (!m[1].startsWith('.') && !m[1].startsWith('@/') && !m[1].startsWith('~/')) {
          dependencies.push(m[1].split('/')[0])
        }
      }
    }

    // ── Vue
    else if (stack.primary === 'vue' || stack.secondary.includes('vue')) {
      if (!file.name.match(/\.(vue|ts|js)$/)) continue
      if (file.name.endsWith('.vue')) {
        if (path.includes('/views/') || path.includes('/pages/') || name.includes('view') || name.includes('page')) {
          type = 'page'
          description = `Vue View: ${cleanComponentName(file.name)}`
        } else {
          type = 'component'
          description = `Vue Component: ${cleanComponentName(file.name)}`
        }
        const importMatches = content.matchAll(/import .+ from ['"]([^'"]+)['"]/g)
        for (const m of importMatches) {
          if (!m[1].startsWith('.') && !m[1].startsWith('@/') && !m[1].startsWith('~/')) {
            dependencies.push(m[1].split('/')[0])
          }
        }
      } else if (name.includes('store') || name.includes('pinia') || name.includes('vuex')) {
        type = 'module'
        description = `State Store: ${cleanComponentName(file.name)}`
      } else if (name.includes('router') || name.includes('routes')) {
        type = 'module'
        description = `Router: ${cleanComponentName(file.name)}`
        endpoints.push(...extractAngularRoutes(content))
      } else if (name.includes('composable') || name.startsWith('use')) {
        type = 'hook'
        description = `Composable: ${cleanComponentName(file.name)}`
      } else if (name.includes('service') || name.includes('api')) {
        type = 'service'
        description = `Service: ${cleanComponentName(file.name)}`
      } else {
        continue
      }
    }

    // ── Angular
    else if (stack.primary === 'angular' || stack.secondary.includes('angular')) {
      if (!file.name.match(/\.(ts)$/)) continue
      if (content.includes('@Component(')) {
        type = 'component'
        description = `Angular Component: ${cleanComponentName(file.name)}`
        endpoints.push(...extractAngularRoutes(content))
      } else if (content.includes('@Injectable(')) {
        type = 'service'
        description = `Angular Service: ${cleanComponentName(file.name)}`
      } else if (content.includes('@NgModule(')) {
        type = 'module'
        description = `Angular Module: ${cleanComponentName(file.name)}`
      } else if (content.includes('@Controller(') || content.includes('@Get(') || content.includes('@Post(')) {
        // NestJS inside Angular project
        type = 'controller'
        description = `NestJS Controller: ${cleanComponentName(file.name)}`
        endpoints.push(...extractNodeEndpoints(content, file.path))
      } else {
        continue
      }
    }

    // ── .NET / C#
    else if (stack.primary === 'dotnet') {
      if (!file.name.endsWith('.cs')) continue
      if (content.includes('ControllerBase') || content.includes('[ApiController]') || content.includes('Controller]') || name.includes('controller')) {
        type = 'controller'
        description = extractCSharpClassDescription(content, 'Controller')
        endpoints.push(...extractDotNetEndpoints(content, file.path))
      } else if (content.includes('DbContext') || name.includes('context') || name.includes('repository')) {
        type = 'repository'
        description = extractCSharpClassDescription(content, 'Repository/Context')
      } else if (name.includes('service') || content.includes('IServiceCollection')) {
        type = 'service'
        description = extractCSharpClassDescription(content, 'Service')
      } else if (content.includes('[Table(') || content.includes('IEntity') || name.includes('model') || name.includes('entity') || name.includes('dto')) {
        type = 'model'
        description = extractCSharpClassDescription(content, 'Model/DTO')
      } else if (content.includes('IMiddleware') || name.includes('middleware') || name.includes('filter')) {
        type = 'util'
        description = extractCSharpClassDescription(content, 'Middleware')
      } else if (name.includes('startup') || name.includes('program') || content.includes('WebApplication.CreateBuilder')) {
        type = 'config'
        description = extractCSharpClassDescription(content, 'Startup/Config')
      } else {
        continue
      }
      // Extract using dependencies
      const usingMatches = content.matchAll(/using\s+([\w.]+);/g)
      for (const m of usingMatches) {
        const ns = m[1].split('.')[0]
        if (!['System', 'Microsoft', 'Newtonsoft'].includes(ns)) dependencies.push(ns)
      }
    }

    // ── Flutter / Dart
    else if (stack.primary === 'flutter') {
      if (!file.name.endsWith('.dart')) continue
      if (path.includes('/screens/') || path.includes('/pages/') || path.includes('/views/') || name.includes('screen') || name.includes('page') || name.includes('view')) {
        type = 'page'
        description = `Screen: ${cleanComponentName(file.name)}`
      } else if (path.includes('/widgets/') || name.includes('widget') || content.includes('extends StatelessWidget') || content.includes('extends StatefulWidget')) {
        type = 'component'
        description = `Widget: ${cleanComponentName(file.name)}`
      } else if (path.includes('/providers/') || name.includes('provider') || content.includes('ChangeNotifier') || content.includes('Cubit') || content.includes('Bloc')) {
        type = 'service'
        description = `State Provider: ${cleanComponentName(file.name)}`
      } else if (path.includes('/repositories/') || name.includes('repository') || name.includes('datasource')) {
        type = 'repository'
        description = `Repository: ${cleanComponentName(file.name)}`
      } else if (path.includes('/models/') || name.includes('model') || name.includes('entity') || name.includes('dto')) {
        type = 'model'
        description = `Model: ${cleanComponentName(file.name)}`
      } else if (name.includes('service') || name.includes('api') || name.includes('client')) {
        type = 'service'
        description = `Service: ${cleanComponentName(file.name)}`
      } else {
        continue
      }
      // Extract imports
      const importMatches = content.matchAll(/import\s+'package:([^/]+)/g)
      for (const m of importMatches) dependencies.push(m[1])
    }

    // ── Node.js / Express / Fastify / NestJS
    else if (stack.primary === 'node') {
      if (!file.name.match(/\.(ts|js|mts|mjs)$/)) continue
      if (name.includes('route') || name.includes('router') || name.includes('controller') ||
          content.includes('@Controller(') || content.includes('@Get(') || content.includes('@Post(')) {
        type = 'controller'
        description = `Route handler: ${cleanComponentName(file.name)}`
        endpoints.push(...extractNodeEndpoints(content, file.path))
      } else if (name.includes('service') || name.includes('repository') || name.includes('dao') || content.includes('@Injectable()')) {
        type = 'service'
        description = `Service: ${cleanComponentName(file.name)}`
      } else if (name.includes('middleware') || name.includes('guard') || name.includes('interceptor')) {
        type = 'util'
        description = `Middleware: ${cleanComponentName(file.name)}`
      } else if (name.includes('model') || name.includes('schema') || name.includes('entity') || content.includes('@Entity()')) {
        type = 'model'
        description = `Data model: ${cleanComponentName(file.name)}`
      } else if (name.includes('module') && content.includes('@Module(')) {
        type = 'module'
        description = `NestJS Module: ${cleanComponentName(file.name)}`
      } else {
        continue
      }
    }

    // ── Python
    else if (stack.primary === 'python') {
      if (!file.name.match(/\.py$/)) continue
      if (name.includes('view') || name.includes('router') || name.includes('route') || content.includes('@app.route') || content.includes('@router.')) {
        type = 'controller'
        description = `View/Route: ${cleanComponentName(file.name)}`
        endpoints.push(...extractPythonEndpoints(content, file.path))
      } else if (name.includes('model') || content.includes('class Meta:') || content.includes('BaseModel')) {
        type = 'model'
        description = `Model: ${cleanComponentName(file.name)}`
      } else if (name.includes('service') || name.includes('util') || name.includes('helper')) {
        type = 'service'
        description = `Service: ${cleanComponentName(file.name)}`
      } else {
        continue
      }
    }

    // ── Generic fallback (if none matched, skip)
    else {
      continue
    }

    if (!description) description = `${type}: ${cleanComponentName(file.name)}`

    modules.push({
      name: cleanComponentName(file.name),
      path: file.path,
      type,
      description,
      dependencies: [...new Set(dependencies)].slice(0, 8),
      endpoints: endpoints.length > 0 ? endpoints : undefined,
    })
  }

  // Deduplicate by name
  const seen = new Set<string>()
  return modules.filter(m => {
    if (seen.has(m.name)) return false
    seen.add(m.name)
    return true
  }).slice(0, 60)
}

// ─────────────────────────────────────────────────────────────────────────────
// .NET / C# helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractCSharpClassDescription(content: string, defaultType: string): string {
  const classMatch = content.match(/(?:public\s+)?(?:partial\s+)?class\s+(\w+)/)
  const name = classMatch?.[1] ?? 'Unknown'
  return `${defaultType}: ${name.replace(/([a-z])([A-Z])/g, '$1 $2')}`
}

function extractDotNetEndpoints(content: string, filePath: string): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  const basePath = content.match(/\[Route\("([^"]+)"\)\]/)?.[1] ?? ''
  const httpRe = /\[(Http(?:Get|Post|Put|Delete|Patch))(?:\("([^"]*)"\))?\]/g
  for (const m of content.matchAll(httpRe)) {
    const verb = m[1].replace('Http', '').toUpperCase() as ParsedEndpoint['method']
    const subPath = m[2] ?? ''
    const path = normalizePath([basePath, subPath].filter(Boolean).join('/'))
    endpoints.push({ method: verb, path, description: `${verb} ${path} in ${fileName(filePath)}` })
  }
  // Minimal Actions controller style [HttpGet]
  if (endpoints.length === 0 && content.includes('[HttpGet]')) {
    endpoints.push({ method: 'GET', path: `/${fileName(filePath).replace('.cs','')}`, description: `GET in ${fileName(filePath)}` })
  }
  return endpoints
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractSpringEndpoints(content: string, filePath: string): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  const baseMatch = content.match(/@RequestMapping\(["']([^"']+)["']\)/)
  const basePath = baseMatch?.[1] ?? ''

  const mappingRe = /@(Get|Post|Put|Delete|Patch)Mapping\((?:value\s*=\s*)?["']?([^"'\s\)]+)["']?\)/g
  for (const m of content.matchAll(mappingRe)) {
    const method = m[1].toUpperCase() as ParsedEndpoint['method']
    const path   = normalizePath(basePath + '/' + (m[2] ?? ''))
    endpoints.push({ method, path, description: `${method} ${path} in ${fileName(filePath)}` })
  }
  return endpoints
}

function extractNodeEndpoints(content: string, filePath: string): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  // Express/Fastify style: router.get('/path', ...) or app.post('/path', ...)
  const routeRe = /(?:router|app|fastify|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  for (const m of content.matchAll(routeRe)) {
    endpoints.push({
      method: m[1].toUpperCase() as ParsedEndpoint['method'],
      path: m[2],
      description: `${m[1].toUpperCase()} ${m[2]} in ${fileName(filePath)}`,
    })
  }
  // NestJS decorators
  const nestRe = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)/g
  for (const m of content.matchAll(nestRe)) {
    endpoints.push({
      method: m[1].toUpperCase() as ParsedEndpoint['method'],
      path: m[2] || '/',
      description: `${m[1].toUpperCase()} ${m[2] || '/'} in ${fileName(filePath)}`,
    })
  }
  return endpoints
}

function extractAngularRoutes(content: string): ParsedEndpoint[] {
  const routes: ParsedEndpoint[] = []
  const pathRe = /path\s*:\s*['"`]([^'"`]+)['"`]/g
  for (const m of content.matchAll(pathRe)) {
    routes.push({ method: 'GET', path: '/' + m[1], description: `Angular route: /${m[1]}` })
  }
  return routes
}

function extractPythonEndpoints(content: string, filePath: string): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  // Flask / FastAPI style
  const routeRe = /@(?:app|router|blueprint)\.(route|get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi
  for (const m of content.matchAll(routeRe)) {
    const verb = m[1].toLowerCase()
    const method: ParsedEndpoint['method'] = (verb === 'route' ? 'GET' : verb.toUpperCase()) as ParsedEndpoint['method']
    endpoints.push({ method, path: m[2], description: `${method} ${m[2]} in ${fileName(filePath)}` })
  }
  return endpoints
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature inference
// ─────────────────────────────────────────────────────────────────────────────

interface FeaturePattern {
  name: string
  description: string
  category: ParsedFeature['category']
  patterns: RegExp[]
}

const FEATURE_PATTERNS: FeaturePattern[] = [
  {
    name: 'Autenticação', category: 'auth',
    description: 'Login, JWT, OAuth, controle de acesso e sessão.',
    patterns: [/auth/i, /login/i, /jwt/i, /oauth/i, /session/i, /permission/i, /role/i, /bearer/i, /keycloak/i, /spring.security/i, /identity/i, /claims/i],
  },
  {
    name: 'Gestão de Usuários', category: 'crud',
    description: 'CRUD de usuários, perfis e preferências.',
    patterns: [/user/i, /usuario/i, /perfil/i, /profile/i, /account/i, /member/i, /customer/i],
  },
  {
    name: 'Pagamentos', category: 'business',
    description: 'Integração de pagamentos, cobranças e assinaturas.',
    patterns: [/payment/i, /pagamento/i, /stripe/i, /paypal/i, /checkout/i, /billing/i, /subscription/i, /invoice/i, /webhook/i, /mercadopago/i, /pagseguro/i],
  },
  {
    name: 'Notificações', category: 'business',
    description: 'Email, push, SMS e notificações em tempo real.',
    patterns: [/notif/i, /email/i, /push/i, /sms/i, /alert/i, /mailer/i, /resend/i, /sendgrid/i, /firebase.messaging/i, /websocket/i, /signalr/i],
  },
  {
    name: 'API REST', category: 'integration',
    description: 'Endpoints REST documentados e expostos.',
    patterns: [/controller/i, /router/i, /endpoint/i, /route/i, /@RestController/i, /@GetMapping/i, /\[ApiController\]/i, /ApiController/i],
  },
  {
    name: 'Banco de Dados', category: 'infra',
    description: 'Camada de persistência, ORM e migrações.',
    patterns: [/repository/i, /dao/i, /migration/i, /schema/i, /entity/i, /model/i, /database/i, /pg/i, /mysql/i, /mongo/i, /redis/i, /jpa/i, /hibernate/i, /drizzle/i, /prisma/i, /typeorm/i, /dbcontext/i, /efcore/i, /sqlalchemy/i],
  },
  {
    name: 'Upload de Arquivos', category: 'business',
    description: 'Upload, processamento e armazenamento de arquivos.',
    patterns: [/upload/i, /storage/i, /s3/i, /gcs/i, /multipart/i, /blob/i, /azureblob/i, /firebase.storage/i],
  },
  {
    name: 'Cache & Performance', category: 'infra',
    description: 'Cache em memória, Redis, CDN e otimizações.',
    patterns: [/cache/i, /redis/i, /memcached/i, /cdn/i, /performance/i, /optimize/i, /rate.limit/i, /idistributedcache/i],
  },
  {
    name: 'CI/CD & Deploy', category: 'infra',
    description: 'Pipelines de build, testes e deploy automatizado.',
    patterns: [/pipeline/i, /docker/i, /kubernetes/i, /k8s/i, /github.action/i, /deploy/i, /release/i, /helm/i, /terraform/i, /dockerfile/i],
  },
  {
    name: 'Testes', category: 'test',
    description: 'Testes unitários, integração e E2E.',
    patterns: [/test/i, /spec/i, /jest/i, /cypress/i, /vitest/i, /junit/i, /mockito/i, /pytest/i, /e2e/i, /xunit/i, /nunit/i, /flutter_test/i],
  },
  {
    name: 'Dashboard & Analytics', category: 'ui',
    description: 'Painéis, relatórios e visualização de dados.',
    patterns: [/dashboard/i, /analytics/i, /chart/i, /report/i, /metric/i, /stats/i, /recharts/i, /chartjs/i],
  },
  {
    name: 'Busca', category: 'business',
    description: 'Busca full-text, filtros e indexação.',
    patterns: [/search/i, /busca/i, /elastic/i, /algolia/i, /solr/i, /filter/i, /opensearch/i],
  },
  {
    name: 'Integração Externa', category: 'integration',
    description: 'Consumo de APIs externas e webhooks.',
    patterns: [/webhook/i, /integration/i, /httpclient/i, /axios/i, /fetch/i, /external/i, /httpservice/i],
  },
  {
    name: 'Logging & Monitoramento', category: 'infra',
    description: 'Logs estruturados, tracing e alertas.',
    patterns: [/log/i, /monitor/i, /trace/i, /sentry/i, /datadog/i, /prometheus/i, /grafana/i, /newrelic/i, /ilogger/i, /logging/i],
  },
  {
    name: 'Geolocalização & Mapas', category: 'business',
    description: 'Mapas, GPS, rotas e localização.',
    patterns: [/map/i, /location/i, /geo/i, /gps/i, /googlemaps/i, /leaflet/i, /mapbox/i, /geofire/i],
  },
  {
    name: 'Internacionalização', category: 'ui',
    description: 'i18n, múltiplos idiomas e localização.',
    patterns: [/i18n/i, /intl/i, /locale/i, /translation/i, /localization/i, /languag/i],
  },
  {
    name: 'Estado Global (State)', category: 'ui',
    description: 'Gerenciamento de estado global da aplicação.',
    patterns: [/redux/i, /zustand/i, /mobx/i, /vuex/i, /pinia/i, /provider/i, /bloc/i, /cubit/i, /riverpod/i],
  },
  {
    name: 'Segurança & CORS', category: 'auth',
    description: 'CORS, CSP, validação de entrada e proteção.',
    patterns: [/cors/i, /csrf/i, /sanitiz/i, /validation/i, /helmet/i, /xss/i, /security/i, /allowcredentials/i],
  },
]

function inferFeatures(files: ParsedFile[], modules: ParsedModule[]): ParsedFeature[] {
  const allText = [
    ...files.map(f => f.path + ' ' + f.name + ' ' + f.content.slice(0, 5000)),
    ...modules.map(m => m.name + ' ' + m.description),
  ].join('\n').toLowerCase()

  const features: ParsedFeature[] = []

  for (const pattern of FEATURE_PATTERNS) {
    const matchCount = pattern.patterns.filter(p => p.test(allText)).length
    if (matchCount >= 2) {
      const relatedModules = modules
        .filter(m => pattern.patterns.some(p => p.test(m.name + ' ' + m.path)))
        .map(m => m.name)
        .slice(0, 4)

      features.push({
        name: pattern.name,
        description: pattern.description,
        relatedModules,
        category: pattern.category,
      })
    }
  }

  return features
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractDependencies(files: ParsedFile[]): Record<string, string> {
  const deps: Record<string, string> = {}

  // package.json
  const pkg = files.find(f => f.name === 'package.json' && !f.path.includes('node_modules'))
  if (pkg) {
    const json = safeParseJSON(pkg.content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    Object.assign(deps, json.dependencies ?? {}, json.devDependencies ?? {})
  }

  // pom.xml — extract artifactId + version
  const pom = files.find(f => f.name === 'pom.xml')
  if (pom) {
    const depRe = /<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?(?:<version>([^<]*)<\/version>)?[\s\S]*?<\/dependency>/g
    for (const m of pom.content.matchAll(depRe)) {
      deps[m[1]] = m[2] ?? 'managed'
    }
  }

  // requirements.txt
  const req = files.find(f => f.name === 'requirements.txt')
  if (req) {
    for (const line of req.content.split('\n')) {
      const [pkg] = line.trim().split(/[=><~!]/)
      if (pkg && !pkg.startsWith('#') && pkg.trim()) {
        deps[pkg.trim()] = line.slice(pkg.length).trim() || '*'
      }
    }
  }

  // pubspec.yaml (Flutter)
  const pubspec = files.find(f => f.name === 'pubspec.yaml')
  if (pubspec) {
    const depSection = pubspec.content.match(/dependencies:([\s\S]*?)(?:\n\w|\ndev_dependencies)/)?.[1] ?? ''
    for (const m of depSection.matchAll(/^\s+(\w+):\s*(.*)$/gm)) {
      deps[m[1]] = m[2].trim() || '*'
    }
  }

  return deps
}

// ─────────────────────────────────────────────────────────────────────────────
// Project summary generation
// ─────────────────────────────────────────────────────────────────────────────

function generateSummary(
  name: string,
  stack: DetectedStack,
  modules: ParsedModule[],
  features: ParsedFeature[],
  endpoints: ParsedEndpoint[],
  deps: Record<string, string>,
): string {
  const moduleTypes = [...new Set(modules.map(m => m.type))]
  const topDeps = Object.keys(deps).slice(0, 8).join(', ')
  return [
    `Projeto: ${name}`,
    `Stack: ${stack.details} (confiança: ${stack.confidence}%)`,
    `${modules.length} módulos detectados: ${moduleTypes.join(', ')}`,
    `${features.length} funcionalidades: ${features.map(f => f.name).join(', ')}`,
    `${endpoints.length} endpoints de API`,
    topDeps ? `Dependências principais: ${topDeps}` : '',
  ].filter(Boolean).join('. ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export function parseProject(files: ParsedFile[], projectName?: string): ParsedProject {
  const name = projectName ?? inferProjectName(files)
  const stack = detectStack(files)
  const modules = extractModules(files, stack)
  const features = inferFeatures(files, modules)
  const endpoints = modules.flatMap(m => m.endpoints ?? [])
  const dependencies = extractDependencies(files)

  const entryPoints = files
    .filter(f =>
      ['main.ts', 'main.tsx', 'index.ts', 'index.tsx', 'app.ts', 'app.tsx',
       'main.java', 'Main.java', 'Application.java', 'main.py', 'app.py',
       'main.dart', 'Program.cs', 'Startup.cs'].includes(f.name)
    )
    .map(f => f.path)

  const configFiles = files
    .filter(f =>
      ['package.json', 'pom.xml', 'build.gradle', 'requirements.txt',
       'pubspec.yaml', 'tsconfig.json', 'angular.json', 'vite.config.ts',
       'webpack.config.js', 'docker-compose.yml', 'Dockerfile', '.env.example',
       'application.properties', 'application.yml', 'appsettings.json'].includes(f.name)
    )
    .map(f => f.path)

  const summary = generateSummary(name, stack, modules, features, endpoints, dependencies)

  return {
    name,
    stack,
    modules,
    features,
    endpoints,
    dependencies,
    entryPoints,
    configFiles,
    rawFileCount: files.length,
    summary,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeParseJSON(text: string): unknown {
  try { return JSON.parse(text) } catch { return {} }
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

function normalizePath(p: string): string {
  return '/' + p.replace(/\/+/g, '/').replace(/^\//, '')
}

function cleanComponentName(filename: string): string {
  return filename
    .replace(/\.(tsx?|jsx?|java|kt|py|cs|dart|vue)$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

function extractJavaClassDescription(content: string, defaultType: string): string {
  const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/)
  const name = classMatch?.[1] ?? 'Unknown'
  return `${defaultType}: ${name.replace(/([a-z])([A-Z])/g, '$1 $2')}`
}

function inferProjectName(files: ParsedFile[]): string {
  // Try package.json name
  const pkg = files.find(f => f.name === 'package.json' && !f.path.includes('node_modules'))
  if (pkg) {
    const json = safeParseJSON(pkg.content) as { name?: string }
    if (json.name && typeof json.name === 'string') return titleCase(json.name)
  }
  // Try pom.xml artifactId
  const pom = files.find(f => f.name === 'pom.xml')
  if (pom) {
    const m = pom.content.match(/<artifactId>([^<]+)<\/artifactId>/)
    if (m) return titleCase(m[1])
  }
  // Try pubspec.yaml name
  const pub = files.find(f => f.name === 'pubspec.yaml')
  if (pub) {
    const m = pub.content.match(/^name:\s*(.+)/m)
    if (m) return titleCase(m[1].trim())
  }
  // Try root folder name from first file path
  const root = files[0]?.path.split('/').filter(Boolean)[0]
  return root ? titleCase(root) : 'Projeto Importado'
}

function titleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
