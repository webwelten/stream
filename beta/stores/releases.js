const setTitle = require('../lib/title')
const Playlist = require('@resonate/playlist-component')
const List = require('../components/trackgroups')

function releases () {
  return (state, emitter) => {
    state.cache(List, 'latest-releases')

    state.releases = state.releases || {
      items: []
    }

    state.release = state.release || {
      data: {},
      tracks: []
    }

    emitter.on('releases:clear', () => {
      state.releases.items = []
      emitter.emit(state.events.RENDER)
    })

    emitter.on('release:clear', () => {
      state.release.loaded = false
      state.release.notFound = false
      state.release = {
        data: {},
        tracks: []
      }
      emitter.emit(state.events.RENDER)
    })

    emitter.on('releases:find', async (props = {}) => {
      const component = state.components['latest-releases']
      const { machine } = component

      if (machine.state.request === 'loading') {
        return
      }

      const loaderTimeout = setTimeout(() => {
        machine.emit('loader:toggle')
      }, 1000)

      machine.emit('request:start')

      const limit = props.limit || 20
      const page = props.page || 1

      const payload = {
        limit: limit,
        page: page
      }

      if (props.featured) {
        payload.featured = true
      }

      try {
        const response = await state.apiv2.releases.find(payload)

        if (response.status !== 'ok' || !Array.isArray(response.data)) {
          component.error = response
          return machine.emit('request:error')
        }

        if (!response.data.length) {
          return machine.emit('request:noResults')
        }

        machine.state.loader === 'on' && machine.emit('loader:toggle')
        machine.emit('request:resolve')

        state.releases.items = response.data
        state.releases.pages = response.numberOfPages || 1

        emitter.emit(state.events.RENDER)
      } catch (err) {
        component.error = err
        machine.emit('request:reject')
        emitter.emit('error', err)
        // TODO handle status code (need to update factory generator)
      } finally {
        clearTimeout(loaderTimeout)
      }
    })

    emitter.on('releases:findOne', async (props) => {
      const cid = `release-${state.params.id}`

      state.cache(Playlist, cid)

      const component = state.components[cid]

      const { machine, events } = component

      const loaderTimeout = setTimeout(() => {
        events.emit('loader:on')
      }, 300)

      machine.emit('start')

      try {
        let response = await state.apiv2.releases.findOne({
          id: props.id
        })

        if (!response.data) {
          state.release.notFound = true
          state.release.loaded = true

          machine.emit('404')

          emitter.emit(state.events.RENDER)
        } else {
          state.release.data = response.data

          let counts = {}

          if (state.user.uid) {
            response = await state.apiv2.plays.resolve({ ids: response.data.items.map(item => item.track.id) })

            counts = response.data.reduce((o, item) => {
              o[item.track_id] = item.count
              return o
            }, {})
          }

          machine.emit('resolve')

          state.release.tracks = state.release.data.items.map((item) => {
            return {
              count: counts[item.track.id] || 0,
              fav: 0,
              track_group: [
                item
              ],
              track: item.track,
              url: item.track.url || `https://api.resonate.is/v1/stream/${item.track.id}`
            }
          })

          if (!state.tracks.length) {
            state.tracks = state.release.tracks
          }
        }

        state.release.loaded = true

        emitter.emit(state.events.RENDER)

        setMeta()
      } catch (err) {
        machine.emit('reject')
        emitter.emit('error', err)
      } finally {
        clearTimeout(loaderTimeout)
      }
    })

    emitter.on('route:/', () => {
    })

    emitter.on('route:releases', () => {
      emitter.emit('releases:find', { page: state.query.page })
    })

    emitter.on('route:discovery', () => {
      emitter.emit('releases:find', { page: state.query.page, featured: true })
    })

    emitter.on('route:artist/:id/album/:slug', async () => {
      emitter.emit('release:clear')

      try {
        const { href } = new URL(state.href, 'https://beta.stream.resonate.localhost')
        const response = await state.apiv2.resolve({
          url: href
        })

        emitter.emit('releases:findOne', { id: response.data.id })
      } catch (err) {
        emitter.emit('error', err)
      }
    })

    function setMeta () {
      const title = {
        'u/:id/album/:slug': state.release.data.title || '...',
        'artist/:id/album/:slug': state.release.data.title || '...'
      }[state.route]

      if (!title) return

      emitter.emit('meta', {
        title: setTitle(title),
        'twitter:card': 'summary_large_image',
        'twitter:title': setTitle(title),
        'twitter:site': '@resonatecoop'
      })
    }
  }
}

module.exports = releases
