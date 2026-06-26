import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { input: 'src/contract/index', name: 'contract/index' },
  ],
  declaration: true,
  rollup: {
    emitCJS: false,
  },
})
