import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { input: 'src/contract/index', name: 'contract/index' },
    { input: 'src/runtime/server/index', name: 'runtime/server/index' },
  ],
  declaration: true,
  rollup: {
    emitCJS: false,
  },
})
