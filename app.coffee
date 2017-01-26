$ ->
  $('#signin').modal
    backdrop: 'static'
    keyboard: false

  AWS.config.region = window.past3_config.region

  CodeMirror.modeURL = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.22.2/mode/%N/%N.js'

  window.editor = CodeMirror.fromTextArea document.getElementById('editor'),
    extraKeys:
      Tab: (cm) -> cm.replaceSelection(Array(cm.getOption("indentUnit") + 1).join(" "))
    lineNumbers: true
    viewportMargin: 25

  window.editor.setSize null, '100%'

  $('#filename').bind 'input', filenameInput

  $('#newFile').bind 'click', () ->
    $('#filename').val('')
    $('#file-url').val('n/a')
    window.editor.setValue('')
    $('.file-list-item').removeClass 'active'
    return false

  $('#saveFile').bind 'click', () ->
    filename = $('#filename').val()
    window.editor.save()
    content = $('#editor').val()
    saveFile(filename, content)

  $('#deleteFile').bind 'click', () ->
    filename = $('#filename').val()
    deleteFile(filename)

  $('#file-url').bind 'click', () ->
    $(this).select()

  $(window).bind 'hashchange', () ->
    if window.location.hash.length > 1
      filename = window.location.hash.substring(1)
      getFile filename

      $('.file-list-item').removeClass 'active'
      $(".file-list-item").each () ->
        if $(this).data('file') == filename
          $(this).addClass 'active'

  $(window).bind 'keydown', (e) ->
    if (e.metaKey or e.ctrlKey) and e.keyCode == 83 # cmd+s / ctrl+s
      $('#saveFile').trigger 'click'
      e.preventDefault()
      return false

    if (e.metaKey or e.ctrlKey) and e.keyCode == 78 # cmd+n / ctrl+n
      $('#newFile').trigger 'click'
      e.preventDefault()
      return false

    if (e.metaKey or e.ctrlKey) and e.keyCode == 82 # cmd+r / ctrl+r
      listFiles()
      e.preventDefault()
      return false

signinCallback = (authResult) ->
  if authResult.Zi.id_token
    getAWSCredentials authResult.Zi.id_token

    window.past3_credential_refresh = window.setInterval () ->
      if new Date(AWS.config.credentials.expireTime - 300000) < new Date()
        refreshGoogleLogin()
    , 10000

getAWSCredentials = (googleIDToken) ->
    AWS.config.credentials = new AWS.CognitoIdentityCredentials
      IdentityPoolId: window.past3_config.identity_pool_id
      Logins:
        'accounts.google.com': googleIDToken

    AWS.config.credentials.get () ->
      $('#signin').modal 'hide'
      listFiles()
      $(window).trigger 'hashchange'

renderButton = () ->
  gapi.signin2.render 'signInButton',
    'scope': 'profile email',
    'width': 240,
    'height': 30,
    'longtitle': true,
    'theme': 'dark',
    'onsuccess': signinCallback,

getFilePrefix = () ->
  s3 = new AWS.S3()
  "#{s3.config.credentials.identityId}/"

getFile = (filename) ->
  s3 = new AWS.S3()
  s3.getObject({
    Bucket: window.past3_config.bucket
    Key: getFilePrefix() + filename
  }, loadFileIntoEditor)
  $('#filename').val filename
  $('#filename').trigger 'input'

listFiles = () ->
  s3 = new AWS.S3()
  s3.listObjects({
    Bucket: window.past3_config.bucket
    Prefix: getFilePrefix()
  }, loadFileList)

saveFile = (filename, content) ->
  mime = getMimeType filename
  s3 = new AWS.S3()
  s3.putObject({
    ACL: window.past3_config.acl
    Body: content
    Bucket: window.past3_config.bucket
    ContentType: mime.mime
    Key: getFilePrefix() + filename
  }, fileActionCallback)

deleteFile = (filename) ->
  s3 = new AWS.S3()
  s3.deleteObject({
    Bucket: window.past3_config.bucket
    Key: getFilePrefix() + filename
  }, fileActionCallback)

loadFileIntoEditor = (err, data) ->
  if err
    error err
    return

  window.editor.setValue(String(data.Body))

loadFileList = (err, data) ->
  if err
    error err
    return

  $('.file-list-item').remove()
  for obj in data.Contents
    key = obj.Key.replace getFilePrefix(), ''

    li = $("<a href='##{key}' class='list-group-item file-list-item'><span class='badge'></span> #{key}</a>")
    li.find('.badge').text formatDate(obj.LastModified)
    li.data 'file', key

    if key == $('#filename').val()
      li.addClass 'active'

    li.appendTo $('#fileList')

fileActionCallback = (err, data) ->
  if err
    error err
    return

  listFiles()

formatDate = (src) ->
  $.format.date src, 'yyyy-MM-dd HH:mm:ss'

setEditorMime = (filename) ->
  if window.mime_detect
    window.clearTimeout window.mime_detect

  window.mime_detect = window.setTimeout () ->
    autoMime = getMimeType filename
    window.editor.setOption 'mode', autoMime.mime
    CodeMirror.autoLoadMode window.editor, autoMime.mode
  , 500

getMimeType = (filename) ->
  name_parts = filename.split('.')
  ext = name_parts[name_parts.length - 1]

  mime = CodeMirror.findModeByExtension ext

  if mime == undefined
    mime = CodeMirror.findModeByExtension 'txt'

  return mime

filenameInput = () ->
  setEditorMime $(this).val()

  $('#file-url').val window.past3_config.base_url + getFilePrefix() + $(this).val()

error = (err) ->
  ed = $('#errorDisplay')
  ed.find('.alert').text err
  ed.show()

refreshGoogleLogin = () ->
  console.log "Refreshing Google login / AWS credentials to keep editor working"
  gapi.auth2.getAuthInstance().currentUser.get().reloadAuthResponse().then (data) ->
    getAWSCredentials data.id_token
