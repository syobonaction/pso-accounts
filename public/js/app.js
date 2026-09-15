const showLoggedOutState = () => {
  document.querySelector('.action-text').hidden = false
  document.querySelector('.modal').hidden = true
}

const showLoggedInState = (data) => {
  document.querySelector('.action-text').hidden = true
  document.getElementById('sn-value').textContent = data.sn
  document.getElementById('key-value').textContent = data.key
  document.querySelector('.modal').hidden = false
  document.querySelector('.modal h2').focus()
}

const checkLoginState = async () => {
  try {
    const response = await fetch('/api/credentials')
    if (response.status === 401) {
      showLoggedOutState()
      return
    }
    const data = await response.json()
    showLoggedInState(data)
  } catch (err) {
    console.error('Failed to check login state:', err)
    showLoggedOutState()
  }
}

const handleEnterKey = (event) => {
  if (event.key === 'Enter' && document.querySelector('.modal').hidden) {
    window.location.href = '/login'
  }
}

const wireCopyButton = (buttonId, valueId, label) => {
  const button = document.getElementById(buttonId)
  button.addEventListener('click', async () => {
    const value = document.getElementById(valueId).textContent
    await navigator.clipboard.writeText(value)
    document.getElementById('copy-status').textContent = label + ' copied!'
  })
}

document.addEventListener('keydown', handleEnterKey)
wireCopyButton('copy-sn', 'sn-value', 'Serial number')
wireCopyButton('copy-key', 'key-value', 'Access key')
checkLoginState()
