const buildStarStream = () => {
  const container = document.querySelector('.star-stream')
  const count = 250

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const goingRight = i % 2 === 0
    el.className = 'stream-particle ' + (goingRight ? 'stream-right' : 'stream-left')

    const r = Math.max(Math.random() * 4, 3)
    const startY = (Math.random() > 0.5 ? 1 : -1) * Math.random() * r * 0.2
    const startX = (Math.random() > 0.5 ? 1 : -1) * Math.random() * 8
    const duration = Math.max(Math.random() * 30, 15)
    const delay = Math.random() * 15 - 2
    const lightness = Math.round(100 * (r / 4))

    el.style.setProperty('--start-y', startY.toFixed(2) + 'vw')
    el.style.setProperty('--start-x', startX.toFixed(2) + 'vw')
    el.style.setProperty('--r', r.toFixed(2) + 'vw')
    el.style.setProperty('--duration', duration.toFixed(1) + 's')
    el.style.setProperty('--delay', delay.toFixed(1) + 's')
    el.style.setProperty('--lightness', lightness + '%')

    container.appendChild(el)
  }
}

buildStarStream()

const buildStarburst = () => {
  const container = document.querySelector('.starburst')
  const amount = 35

  for (let i = 0; i <= amount; i++) {
    const el = document.createElement('div')
    el.className = 'ray'

    const rot = i / amount
    const length = Math.max(Math.random() * 40, 13)
    const hue = 190 + Math.random() * 65
    const duration = 3
    const duration2 = Math.floor(Math.random() * 4) * duration
    const delay1 = Math.random() * 3

    el.style.setProperty('--rot', rot.toFixed(4))
    el.style.setProperty('--length', length.toFixed(1) + 'vw')
    el.style.setProperty('--hue', hue.toFixed(1))
    el.style.setProperty('--duration2', duration2 + 's')
    el.style.setProperty('--delay1', delay1.toFixed(2) + 's')
    el.style.setProperty('--delay2', (delay1 + duration * Math.floor(Math.random() * 3)).toFixed(2) + 's')

    container.appendChild(el)
  }
}

buildStarburst()
