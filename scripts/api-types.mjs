// Generates src/api/schema.d.ts from the API's OpenAPI contract, or checks
// that the committed file still matches it.
//
//   node scripts/api-types.mjs generate
//   node scripts/api-types.mjs check
//
// The contract defaults to ../latihanAPI/api/openapi.yaml; set
// LATIHAN_API_SPEC to use another path.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const spec = resolve(
  root,
  process.env.LATIHAN_API_SPEC ?? '../latihanAPI/api/openapi.yaml',
)
const target = join(root, 'src/api/schema.d.ts')
const cli = join(root, 'node_modules/openapi-typescript/bin/cli.js')

function generate(output) {
  execFileSync(process.execPath, [cli, spec, '--output', output], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}

const mode = process.argv[2]
if (mode === 'generate') {
  generate(target)
  console.log(`Wrote ${target} from ${spec}`)
} else if (mode === 'check') {
  const dir = mkdtempSync(join(tmpdir(), 'latihan-api-'))
  try {
    const fresh = join(dir, 'schema.d.ts')
    generate(fresh)
    const normalize = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    if (normalize(fresh) !== normalize(target)) {
      console.error(
        `${target} does not match ${spec}.\nRun "npm run gen:api" and review the type errors it causes.`,
      )
      process.exit(1)
    }
    console.log('API types match the contract.')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
} else {
  console.error('Usage: node scripts/api-types.mjs generate|check')
  process.exit(2)
}
