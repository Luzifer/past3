const allUsersURI = 'http://acs.amazonaws.com/groups/global/AllUsers'
const codemirrorModeURL = 'https://cdn.jsdelivr.net/npm/codemirror@5.43.0/mode/%N/%N.js'
const dateFormat = 'YYYY-MM-DD HH:mm:ss'
const defaultCacheControl = 'no-cache'

// showAlert creates an alert message and displays it
function showAlert(type, msg, timeout = 0, actions = {}) {
  let alrt = $(`<div class="alert alert-${type} alert-dismissible"><button type="button" class="close" data-dismiss="alert">&times;</button> ${msg} </div>`)

  for (let key in actions) {
    let lnk = $(`<a href="#" class="alert-link">${key}</a>`)
    lnk.bind('click', (e) => {
      actions[key]()
      $(e.target).parents('.alert').alert('close')
      return false
    })
    lnk.appendTo(alrt)
  }

  alrt.appendTo($('#errorDisplay'))

  if (timeout > 0) {
    window.setTimeout(() => alrt.alert('close'), timeout)
  }
}

// deleteFile removes the specified file from the AWS bucket
function deleteFile(filename) {
  let s3 = new AWS.S3()
  s3.deleteObject({
    Bucket: window.past3_config.bucket,
    Key: getFilePrefix() + filename,
  }, fileActionCallback)

  window.localStorage.removeItem(filename)
}

// error displays the error in the frontend
function error(err) {
  showAlert('danger', err, 0)
}

// fileActionCallback is used to trigger a reload of the file list
function fileActionCallback(err, data) {
  if (err) {
    return error(err)
  }

  listFiles()
}

// filenameInput is the callback for changes in the filename
function filenameInput(e) {
  updateFileURL()
}

// formatDate formats a Date() object into iso-like format
function formatDate(src) {
  return moment(src).format(dateFormat)
}

// getAWSCredentials retrieves AWS credentials via Cognito using the Google ID Token
function getAWSCredentials(googleIDToken) {
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: window.past3_config.identity_pool_id,
    Logins: {
      'accounts.google.com': googleIDToken,
    }
  })

  AWS.config.credentials.get(() => {
    $('#signin').modal('hide')
    listFiles()
    $(window).trigger('hashchange')
  })
}

// getCurrentFileListEntry returns the element of the currently loaded file list entry
function getCurrentFileListEntry() {
  let filename = $('#filename').val()
  let resp = null

  $(".file-list-item").each((idx, e) => {
    if ($(e).data('file') === filename) {
      resp = $(e)
    }
  })

  return resp
}

// getFile retrieves an object from the bucket and loads it into the editor
function getFile(filename) {
  let s3 = new AWS.S3()
  s3.getObject({
    Bucket: window.past3_config.bucket,
    Key: getFilePrefix() + filename,
    ResponseCacheControl: defaultCacheControl,
  }, loadFileIntoEditor)

  // Check whether the file is public
  s3.getObjectAcl({
    Bucket: window.past3_config.bucket,
    Key: getFilePrefix() + filename,
  }, (err, data) => {
    if (err) return error(err)

    for (let grant of data.Grants) {
      if (grant.Grantee.Type == "Group" && grant.Grantee.URI == allUsersURI) {
        $('#acl').data('public', true)
        return updateFileURL()
      }
    }

    $('#acl').data('public', false)
    return updateFileURL()
  })

  $('#filename').val(filename)
  updateFileURL()
}

// getFilePrefix retrieves the file prefix using the Cognito identityId
function getFilePrefix() {
  let s3 = new AWS.S3()
  return `${s3.config.credentials.identityId}/`
}

// getMimeType uses CodeMirror mime guessing to get the mime type of
// the file and falls back to txt if none is found
function getMimeType(filename) {
  let name_parts = filename.split('.')
  let ext = name_parts[name_parts.length - 1]

  let mime = CodeMirror.findModeByExtension(ext)

  if (mime === undefined) {
    mime = CodeMirror.findModeByExtension('txt')
  }

  return mime
}

// getPublicURL returns the public URL of the file. If the file is private and
// the signed parameter is set to true a presigned URL will be created
function getPublicURL(signed = false) {
  let pub = $('#acl').data('public')
  let filename = $('#filename').val()

  if (pub) {
    return window.past3_config.base_url + getFilePrefix() + filename
  }

  if (signed) {
    let s3 = new AWS.S3()
    return s3.getSignedUrl('getObject', {
      Bucket: window.past3_config.bucket,
      Expires: window.past3_config.private_share_expiry,
      Key: getFilePrefix() + filename,
    })
  }

  return 'File is private, no URL available'
}

// info displays the info in the frontend
function info(msg) {
  showAlert('info', msg, 10000)
}

// init initializes the interface with its listeners
function init() {
  // Show sign-in modal
  $('#signin').modal({
    backdrop: 'static',
    keyboard: false,
  })

  // Configure AWS and CodeMirror
  AWS.config.region = window.past3_config.region
  CodeMirror.modeURL = codemirrorModeURL

  // Initialize the editor
  window.editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    extraKeys: {
      Tab: (cm) => cm.replaceSelection(Array(cm.getOption("indentUnit") + 1).join(" ")),
    },
    lineNumbers: true,
    viewportMargin: 25,
  })
  window.editor.setSize(null, '100%')
  window.editor.on('change', (cm, change) => {
    if (change.origin === 'setValue') {
      // Do not cache file when a set was done
      return
    }

    // Store a local copy
    let filename = $('#filename').val()
    if (filename !== '') {
      window.localStorage.setItem(filename, JSON.stringify({
        date: new Date(),
        text: btoa(cm.getValue()),
      }))
    }

    let cf = getCurrentFileListEntry()
    if (cf) cf.find('i').removeClass('fa-file').addClass('fa-file-upload')
  })

  $('#acl').data('public', window.past3_config.default_public)

  // Set up bindings
  $('#acl').bind('click', (e) => {
    let el = $(e.target)
    el.data('public', !el.data('public'))

    updateFileURL()
    return false
  })

  $('#filename').bind('input', filenameInput)

  $('#newFile').bind('click', () => {
    $('#filename').val('')
    $('#file-url').val('n/a')
    window.editor.setValue('')
    $('.file-list-item').removeClass('active')
  })

  $('#saveFile').bind('click', () => {
    window.editor.save()
    let filename = $('#filename').val()
    let content = $('#editor').val()
    saveFile(filename, content)
  })

  $('#deleteFile').bind('click', () => deleteFile($('#filename').val()))

  $('#file-url').bind('click', (e) => $(e.target).select())

  $(window).bind('hashchange', () => {
    if (window.location.hash.length > 1) {
      let filename = window.location.hash.substring(1)
      getFile(filename)

      $('.file-list-item').removeClass('active')
      let cf = getCurrentFileListEntry()
      if (cf) cf.addClass('active')
    }
  })

  $(window).bind('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.keyCode == 83) { // cmd + s / ctrl + s
      $('#saveFile').trigger('click')
      e.preventDefault()
      return false
    }

    if ((e.metaKey || e.ctrlKey) && e.keyCode == 78) { // cmd + n / ctrl + n
      $('#newFile').trigger('click')
      e.preventDefault()
      return false
    }

    if ((e.metaKey || e.ctrlKey) && e.keyCode == 82) { // cmd + r / ctrl + r
      listFiles()
      e.preventDefault()
      return false
    }

    if ((e.metaKey || e.ctrlKey) && e.keyCode == 76) { // cmd + l / ctrl + l
      $('#acl').trigger('click')
      e.preventDefault()
      return false
    }
  })

  new ClipboardJS('#copyURL', {
    text: () => {
      return getPublicURL(true)
    }
  })
}

// listFiles triggers a reload of the file list
function listFiles() {
  let s3 = new AWS.S3()
  s3.listObjects({
    Bucket: window.past3_config.bucket,
    Prefix: getFilePrefix(),
  }, loadFileList)
}

// loadFileIntoEditor sets the editor content
function loadFileIntoEditor(err, data) {
  if (err) {
    return error(err)
  }

  let lastModified = new Date(data.LastModified)
  let cached = window.localStorage.getItem($('#filename').val())

  if (cached !== null) {
    let cd = JSON.parse(cached)
    let cdChange = new Date(cd.date)
    if (lastModified < cdChange) {
      window.editor.setValue(atob(cd.text))
      showAlert('info', `Recovered working copy stored ${formatDate(cdChange)}`, 10000, {
        'Dismiss working copy': () => {
          window.localStorage.removeItem($('#filename').val())
          getFile($('#filename').val())
          listFiles()

          return false
        },
      })
      return
    }
  }

  window.editor.setValue(String(data.Body))
}

// loadFileList re-renders the file list from the AWS bucket list response
function loadFileList(err, data) {
  if (err) {
    return error(err)
  }

  $('.file-list-item').remove()
  for (let obj of data.Contents) {
    let key = obj.Key.replace(getFilePrefix(), '')

    let fileIcon = 'file-alt'
    if (window.localStorage.getItem(key) !== null) {
      fileIcon = 'file-upload'
    } else if (obj.Size === 0) {
      fileIcon = 'file'
    }

    let li = $(`<a href='#${key}' class='list-group-item file-list-item d-flex justify-content-between align-items-center'><span><i class="fas fa-fw fa-${fileIcon}"></i> ${key}</span></a>`)
    li.data('file', key)

    let badge = $(`<span class='badge badge-dark badge-pill'>${formatDate(obj.LastModified)}</span>`)
    badge.appendTo(li)

    if (key === $('#filename').val()) {
      li.addClass('active')
    }

    li.appendTo($('#fileList'))
  }
}

// refreshGoogleLogin triggers a refresh of the Google token
function refreshGoogleLogin() {
  console.log("Refreshing Google login / AWS credentials to keep editor working")
  gapi.auth2.getAuthInstance().currentUser.get().reloadAuthResponse()
    .then((data) => getAWSCredentials(data.id_token))
}

// renderButton displays the sign-in with Google button
function renderButton() {
  gapi.signin2.render('signInButton', {
    'scope': 'profile email',
    'width': 240,
    'height': 30,
    'longtitle': true,
    'theme': 'dark',
    'onsuccess': signinCallback,
  })
}

// saveFile saves the editor content into the S3 bucket
function saveFile(filename, content) {
  let mime = getMimeType(filename)
  let pub = $('#acl').data('public')

  let s3 = new AWS.S3()
  s3.putObject({
    ACL: pub ? 'public-read' : 'private',
    Body: content,
    Bucket: window.past3_config.bucket,
    ContentType: mime.mime,
    Key: getFilePrefix() + filename,
    ServerSideEncryption: 'AES256',
  }, saveFileCallback)
}

// saveFileCallback is triggered after a file save and removes the local copy of the file
function saveFileCallback(err, data) {
  if (err) {
    return error(err)
  }

  window.localStorage.removeItem($('#filename').val())

  fileActionCallback(err, data)
}

// setEditorMime updates the mime type of the file content loaded into the editor
function setEditorMime(filename) {
  if (window.mime_detect) {
    window.clearTimeout(window.mime_detect)
  }

  window.mime_detect = window.setTimeout(() => {
    let autoMime = getMimeType(filename)
    window.editor.setOption('mode', autoMime.mime)
    CodeMirror.autoLoadMode(window.editor, autoMime.mode)
  }, 100)
}

// signinCallback is triggered by the Google sign-in button
function signinCallback(authResult) {
  if (authResult.Zi.id_token) {
    getAWSCredentials(authResult.Zi.id_token)

    window.past3_credential_refresh = window.setInterval(() => {
      if (new Date(AWS.config.credentials.expireTime - 300000) < new Date()) {
        refreshGoogleLogin()
      }
    }, 10000)
  }
}

// updateFileURL sets the public URL of the file and adjusts the ACL button
function updateFileURL() {
  let pub = $('#acl').data('public')
  let filename = $('#filename').val()

  setEditorMime(filename)

  $('#file-url').val(getPublicURL(false))

  if (pub) {
    $('#acl').find('i').removeClass('fa-unlock').addClass('fa-lock')
  } else {
    $('#acl').find('i').removeClass('fa-lock').addClass('fa-unlock')
  }
}


// Initialize app on document ready
$(() => init())
