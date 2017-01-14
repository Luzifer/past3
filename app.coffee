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

  $('#file-url').bind 'click', () ->
    $(this).select()

signinCallback = (authResult) ->
  if authResult.Zi.id_token

    AWS.config.credentials = new AWS.CognitoIdentityCredentials
      IdentityPoolId: window.past3_config.identity_pool_id
      Logins:
        'accounts.google.com': authResult.Zi.id_token

    AWS.config.credentials.get () ->
      $('#signin').modal 'hide'
      listFiles()

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
  }, saveFileCallback)

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

    li = $("<a href='#' class='list-group-item file-list-item'><span class='badge'></span> #{key}</a>")
    li.find('.badge').text formatDate(obj.LastModified)
    li.data 'file', key

    if key == $('#filename').val()
      li.addClass 'active'

    li.appendTo $('#fileList')
    li.bind 'click', openFileClick

saveFileCallback = (err, data) ->
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

openFileClick = () ->
  getFile $(this).data('file')

  $('.file-list-item').removeClass 'active'
  $(this).addClass 'active'

  return false

filenameInput = () ->
  setEditorMime $(this).val()

  $('#file-url').val window.past3_config.base_url + getFilePrefix() + $(this).val()

error = (err) ->
  ed = $('#errorDisplay')
  ed.find('.alert').text err
  ed.show()