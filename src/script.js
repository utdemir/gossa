/* eslint-env browser */
/* eslint-disable no-multi-str */

function cancelDefault (e) {
  e.preventDefault()
  e.stopPropagation()
}

const warningMsg = () => 'Leaving will interrupt transfer?\n'
const rmMsg = () => !confirm('Remove file?\n')

const barName = document.getElementById('dlBarName')
const barPc = document.getElementById('dlBarPc')
const barDiv = document.getElementById('progress')
const upGrid = document.getElementById('drop-grid')
const pics = document.getElementById('pics')
const picsHolder = document.getElementById('picsHolder')
const picsLabel = document.getElementById('picsLabel')

// helpers
let allA
let imgsIndex
let allImgs
const decode = a => decodeURIComponent(a).replace(location.origin, '')
const getArrowSelected = () => document.querySelectorAll('i.arrow-selected')[0]
const getASelected = () => !getArrowSelected() ? false : getArrowSelected().parentElement.parentElement.querySelectorAll('a')[0]
const prependPath = a => a.startsWith('/') ? a : decodeURI(location.pathname) + a
const prevent = e => e.preventDefault()

// Soft nav
function browseTo (href) {
  fetch(href, { credentials: 'include' }).then(r => r.text().then(t => {
    const parsed = new DOMParser().parseFromString(t, 'text/html')
    const table = parsed.querySelectorAll('table')[0].innerHTML
    document.body.querySelectorAll('table')[0].innerHTML = table

    const title = parsed.head.querySelectorAll('title')[0].innerText
    // check if is current path - if so skip following
    if (document.head.querySelectorAll('title')[0].innerText !== title) {
      document.head.querySelectorAll('title')[0].innerText = title
      document.body.querySelectorAll('h1')[0].innerText = '.' + title
      history.pushState({}, '', encodeURI(title))
    }

    init()
  }))
}

window.onClickLink = e => {
  if (e.target.innerText.endsWith('/')) {
    storeLastArrowSrc(e.target.href)
    browseTo(e.target.href)
    return false
  } else if (picsOn(true, e.target.href)) {
    return false
  }
  return true
}

const refresh = () => browseTo(location.href)
const prevPage = () => browseTo(location.href + '../')
window.onpopstate = prevPage

// RPC
function rpcFs (call, args, cb) {
  console.log('RPC', call, args)
  const xhr = new XMLHttpRequest()
  xhr.open('POST', location.origin + '/rpc')
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
  xhr.send(JSON.stringify({ call, args }))
  xhr.onload = cb
}

const mkdirCall = (path, cb) => rpcFs('mkdirp', [prependPath(path)], cb)
const rmCall = (path1, cb) => rpcFs('rm', [prependPath(path1)], cb)
const mvCall = (path1, path2, cb) => rpcFs('mv', [path1, path2], cb)

// File upload
let totalDone = 0
let totalUploads = 0
let totalUploadsSize = 0
let totalUploadedSize = []

const dupe = test => allA.find(a => a.innerText.replace('/', '') === test)
const isDupe = t => dupe(t) ? alert(t + ' already already exists') || true : false

function shouldRefresh () {
  totalDone += 1
  if (totalUploads === totalDone) {
    window.onbeforeunload = null
    console.log('Done uploading ' + totalDone + ' files')
    totalDone = 0
    totalUploads = 0
    totalUploadsSize = 0
    totalUploadedSize = []
    barDiv.style.display = 'none'
    refresh()
  }
}

function updatePercent (ev) {
  totalUploadedSize[ev.target.id] = ev.loaded
  const ttlDone = totalUploadedSize.reduce((s, x) => s + x)
  const pc = Math.floor(100 * ttlDone / totalUploadsSize) + '%'
  barPc.innerText = pc
  barPc.style.width = pc
}

function postFile (file, path) {
  path = decodeURI(location.pathname).slice(0, -1) + path
  window.onbeforeunload = warningMsg

  barDiv.style.display = 'block'
  totalUploads += 1
  totalUploadsSize += file.size
  barName.innerText = totalUploads > 1 ? totalUploads + ' files' : file.name

  const formData = new FormData()
  formData.append(file.name, file)

  const xhr = new XMLHttpRequest()
  xhr.open('POST', location.origin + '/post')
  xhr.setRequestHeader('gossa-path', encodeURIComponent(path))
  xhr.upload.addEventListener('load', shouldRefresh)
  xhr.upload.addEventListener('progress', updatePercent)
  xhr.upload.id = totalUploads
  xhr.send(formData)
}

const parseDomFolder = f => f.createReader().readEntries(e => e.forEach(i => parseDomItem(i)))

function parseDomItem (domFile, shoudCheckDupes) {
  if (shoudCheckDupes && isDupe(domFile.name)) {
    return
  }
  if (domFile.isFile) {
    domFile.file(f => postFile(f, domFile.fullPath))
  } else {
    // remove absolute path
    const f = domFile.fullPath.startsWith('/') ? domFile.fullPath.slice(1) : domFile.fullPath
    mkdirCall(f, () => parseDomFolder(domFile))
  }
}

function pushEntry (entry) {
  if (!entry.webkitGetAsEntry && !entry.getAsEntry) {
    return alert('Unsupported browser ! Please update to chrome/firefox.')
  } else {
    entry = entry.webkitGetAsEntry() || entry.getAsEntry()
  }

  parseDomItem(entry, true)
}

// Move files and folders
const isTextEvent = e => e.dataTransfer.items[0].type === 'text/plain'

const isFolder = e => e && e.href && e.innerText.endsWith('/')

const resetBackgroundLinks = () => { allA.forEach(a => { a.parentElement.style.backgroundColor = 'unset' }) }

const setBackgroundLinks = t => { t.style.backgroundColor = 'rgba(123, 123, 123, 0.2)' }

const getLink = e => e.target.parentElement.querySelectorAll('a.list-links')[0]

document.ondragenter = e => {
  if (isPicMode()) { return }
  cancelDefault(e)

  resetBackgroundLinks()

  if (isTextEvent(e) && (isFolder(e.target) || isFolder(e.target.firstChild))) {
    const t = getLink(e)
    if (!t) return
    setBackgroundLinks(t.parentElement)
  }

  if (!isTextEvent(e)) {
    upGrid.style.display = 'flex'
    e.dataTransfer.dropEffect = 'copy'
  }
}

upGrid.ondragleave = e => {
  cancelDefault(e)
  upGrid.style.display = 'none'
}

document.ondragover = e => {
  cancelDefault(e)
  return false
}

// Handle drop - upload or move
document.ondrop = e => {
  cancelDefault(e)
  upGrid.style.display = 'none'
  resetBackgroundLinks()

  if (isTextEvent(e)) {
    const t = e.target.classList.contains('fav') ? e.target : getLink(e)
    if (!t || !t.innerText.endsWith('/')) return
    e.dataTransfer.items[0].getAsString(s => {
      const root = decodeURIComponent(s.replace(location.href, ''))
      const dest = t.innerText + root
      mvCall(prependPath(root), prependPath(dest), refresh)
    })
  } else {
    Array.from(e.dataTransfer.items).forEach(pushEntry)
  }

  return false
}

// Mkdir icon
window.mkdirBtn = function () {
  const folder = prompt('new folder name', '')
  if (folder && !isDupe(folder)) {
    mkdirCall(folder, refresh)
  }
}

// Icon click handler
const getBtnA = e => e.target.parentElement.parentElement.querySelector('a')

window.rm = e => {
  clearTimeout(window.clickToken)
  const path = e.key ? getASelected().href : getBtnA(e).pathname
  rmMsg() || rmCall(decode(path), refresh)
}

window.rename = (e, commit) => {
  clearTimeout(window.clickToken)

  if (!commit) {
    window.clickToken = setTimeout(window.rename, 300, e, true)
    return
  }

  const orig = e.key ? getASelected().innerText : getBtnA(e).innerText
  const chg = prompt('rename to', orig)
  if (chg && !isDupe(chg)) {
    mvCall(prependPath(orig), prependPath(chg), refresh)
  }
}

// Keyboard Arrow
const storeLastArrowSrc = src => localStorage.setItem('last-selected' + location.href, src)

function scrollToArrow () {
  const pos = getArrowSelected().getBoundingClientRect()
  if (pos.top < 0 || pos.bottom > window.innerHeight) {
    setTimeout(scrollTo, 50, 0, pos.y)
  }
}

function clearArrowSelected () {
  const arr = getArrowSelected()
  if (!arr) { return }
  arr.classList.remove('arrow-selected')
}

function restoreCursorPos () {
  clearArrowSelected()
  const hrefSelected = localStorage.getItem('last-selected' + location.href)
  let a = allA.find(el => el.href === hrefSelected)

  if (!a) {
    if (allA[0].innerText === '../') {
      a = allA[1] || allA[0]
    } else {
      a = allA[0]
    }
  }

  const icon = a.parentElement.parentElement.querySelectorAll('.arrow-icon')[0]
  icon.classList.add('arrow-selected')
  scrollToArrow()
}

function moveArrow (down) {
  const all = Array.from(document.querySelectorAll('i.arrow-icon'))
  let i = all.findIndex(el => el.classList.contains('arrow-selected'))

  clearArrowSelected()

  if (down) {
    i = all[i + 1] ? i + 1 : 0
  } else {
    i = all[i - 1] ? i - 1 : all.length - 1
  }

  all[i].classList.add('arrow-selected')
  storeLastArrowSrc(getASelected().href)

  const itemPos = all[i].getBoundingClientRect()

  if (i === 0) {
    scrollTo(0, 0)
  } else if (i === all.length - 1) {
    scrollTo(0, document.documentElement.scrollHeight)
  } else if (itemPos.top < 0) {
    scrollBy(0, -200)
  } else if (itemPos.bottom > window.innerHeight) {
    scrollBy(0, 200)
  }
}

// Pictures carousel
const picTypes = ['.jpg', '.jpeg', '.png', '.gif']
const isPic = src => src && picTypes.find(type => src.toLocaleLowerCase().includes(type))
const isPicMode = () => pics.style.display === 'flex'
window.picsNav = () => picsNav(true)

function setImage () {
  const src = allImgs[imgsIndex]
  picsHolder.src = src
  picsLabel.innerText = src.split('/').pop()
  storeLastArrowSrc(src)
  restoreCursorPos()
}

function picsOn (ifImgSelected, href) {
  href = href || getASelected().href

  if (isPicMode() || (ifImgSelected && !isPic(href))) {
    return false
  }

  if (isPic(href)) {
    imgsIndex = allImgs.findIndex(el => el.includes(href))
  }

  setImage()
  pics.style.display = 'flex'
  return true
}

const picsOff = () => { pics.style.display = 'none' }

window.picsToggle = () => isPicMode() ? picsOff() : picsOn()

function picsNav (down) {
  if (!isPicMode()) { return false }

  if (down) {
    imgsIndex = allImgs[imgsIndex + 1] ? imgsIndex + 1 : 0
  } else {
    imgsIndex = allImgs[imgsIndex - 1] ? imgsIndex - 1 : allImgs.length - 1
  }

  setImage()
  return true
}

// Paste handler
let cuts = []
function onPaste () {
  if (!cuts.length) { return refresh() }
  const root = cuts.pop()
  const pwd = decodeURIComponent(location.pathname)
  const isFolderDest = getASelected().innerText.endsWith('/')
  const filename = root.split('/').pop()
  const dest = isFolderDest ? pwd + getASelected().innerText : pwd
  mvCall(root, dest + filename, onPaste)
}

// Kb handler
let typedPath = ''
let typedToken = null

function cpPath () {
  var t = document.createElement('textarea')
  t.value = getASelected().href
  document.body.appendChild(t)
  t.select()
  document.execCommand('copy')
  document.body.removeChild(t)
}

function setCursorToClosestTyped () {
  const a = allA.find(el => el.innerText.toLocaleLowerCase().startsWith(typedPath))
  if (!a) { return }
  storeLastArrowSrc(a.href)
  restoreCursorPos()
}

document.body.addEventListener('keydown', e => {
  switch (e.code) {
    case 'Tab':
    case 'ArrowDown':
      return prevent(e) || picsNav(true) || moveArrow(true)

    case 'ArrowUp':
      return prevent(e) || picsNav(false) || moveArrow(false)

    case 'Enter':
    case 'ArrowRight':
      return prevent(e) || picsOn(true) || picsNav(true) || getASelected().click()

    case 'ArrowLeft':
      return prevent(e) || picsNav(false) || prevPage()

    case 'Escape':
      return prevent(e) || picsOff()
  }

  // Ctrl keys
  if (e.ctrlKey || e.metaKey) {
    switch (e.code) {
      case 'KeyC':
        return prevent(e) || isPicMode() || cpPath()

      case 'KeyX':
        cuts.push(prependPath(decode(getASelected().href)))
        return prevent(e) || false

      case 'KeyV':
        return prevent(e) || onPaste()

      case 'Backspace':
        return prevent(e) || isPicMode() || window.rm(e)

      case 'KeyE':
        return prevent(e) || isPicMode() || window.rename(e)

      case 'KeyD':
        return prevent(e) || isPicMode() || window.mkdirBtn()
    }
  }

  // text search
  if (e.code.includes('Key')) {
    typedPath += e.code.replace('Key', '').toLocaleLowerCase()
    clearTimeout(typedToken)
    typedToken = setTimeout(() => { typedPath = '' }, 1000)
    setCursorToClosestTyped()
  }
}, false)

function init () {
  allA = Array.from(document.querySelectorAll('a.list-links'))
  allImgs = allA.map(el => el.href).filter(isPic)
  document.getElementsByClassName('icon-large-images')[0].style.display = allImgs.length > 0 ? 'inline-block' : 'none'

  imgsIndex = 0
  restoreCursorPos()
  console.log('Browsed to ' + location.href)
}
init()
