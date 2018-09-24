// deleteFile removes the specified file from the AWS bucket
function deleteFile(filename) {
  let s3 = new AWS.S3()
  s3.deleteObject({
    Bucket: window.past3_config.bucket,
    Key: getFilePrefix() + filename,
  }, fileActionCallback)
}

// error displays the error in the frontend
function error(err) {
  let ed = $('#errorDisplay')
  ed.find('.alert').text(err)
  ed.show()
}

// fileActionCallback is used to trigger a reload of the file list
function fileActionCallback(err, data) {
  if (err) {
    return error(err)
  }

  listFiles()
}

// filenameInput is the callback for changes in the filename
function filenameInput() {
  setEditorMime($(this).val())
  $('#file-url').val(window.past3_config.base_url + getFilePrefix() + $(this).val())
}

// formatDate formats a Date() object into iso-like format
function formatDate(src) {
  return $.format.date(src, 'yyyy-MM-dd HH:mm:ss')
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

// getFile retrieves an object from the bucket and loads it into the editor
function getFile(filename) {
  let s3 = new AWS.S3()
  s3.getObject({
    Bucket: window.past3_config.bucket,
    Key: getFilePrefix() + filename,
  }, loadFileIntoEditor)

  $('#filename').val(filename)
  $('#filename').trigger('input')
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

// init initializes the interface with its listeners
function init() {
  // Show sign-in modal
  $('#signin').modal({
    backdrop: 'static',
    keyboard: false,
  })

  // Configure AWS and CodeMirror
  AWS.config.region = window.past3_config.region
  CodeMirror.modeURL = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.22.2/mode/%N/%N.js'

  // Initialize the editor
  window.editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    extraKeys: {
      Tab: (cm) => cm.replaceSelection(Array(cm.getOption("indentUnit") + 1).join(" ")),
    },
    lineNumbers: true,
    viewportMargin: 25,
  })
  window.editor.setSize(null, '100%')

  // Set up bindings
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

  $('#file-url').bind('click', () => $(this).select())

  $(window).bind('hashchange', () => {
    if (window.location.hash.length > 1) {
      let filename = window.location.hash.substring(1)
      getFile(filename)

      $('.file-list-item').removeClass('active')
      $(".file-list-item").each(() => {
        if ($(this).data('file') == filename) {
          $(this).addClass('active')
        }
      })
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

    let li = $(`<a href='#${key}' class='list-group-item file-list-item'><span class='badge'></span> ${key}</a>`)
    li.find('.badge').text(formatDate(obj.LastModified))
    li.data('file', key)

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
  let s3 = new AWS.S3()
  s3.putObject({
    ACL: window.past3_config.acl,
    Body: content,
    Bucket: window.past3_config.bucket,
    ContentType: mime.mime,
    Key: getFilePrefix() + filename,
  }, fileActionCallback)
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
  }, 500)
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


// Initialize app on document ready
$(() => init())
