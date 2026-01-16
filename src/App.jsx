// File: src/App.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

function App() {
  const [session, setSession] = useState(null) // User login hai ya nahi
  const [email, setEmail] = useState('')
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState([])
  const [folders, setFolders] = useState([])
  const [message, setMessage] = useState('')
  const [currentFolderId, setCurrentFolderId] = useState(null) // Current folder ID (null = Home)
  const [breadcrumbs, setBreadcrumbs] = useState([]) // Breadcrumb navigation
  const [showNewDropdown, setShowNewDropdown] = useState(false) // New button dropdown
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderModal, setNewFolderModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showFolderMenu, setShowFolderMenu] = useState(null) // Which folder menu is open
  const [showFileMenu, setShowFileMenu] = useState(null) // Which file menu is open
  const [isRenamingFolder, setIsRenamingFolder] = useState(null) // Which folder is being renamed
  const [isRenamingFile, setIsRenamingFile] = useState(null) // Which file is being renamed
  const [renameValue, setRenameValue] = useState('') // New name for folder/file
  const [trash, setTrash] = useState([]) // Deleted items
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false) // Mobile sidebar state
  const [toasts, setToasts] = useState([]) // Toast notifications
  const [smallConfirm, setSmallConfirm] = useState({
    open: false,
    title: '',
    message: '',
    onConfirm: null
  })

  const confirmActionRef = useRef(null)
  const uploadInputRef = useRef(null)
  const uploadModalInputRef = useRef(null)
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    showCancel: true
  })

  const openConfirmDialog = ({ title, message, confirmText = 'Confirm', showCancel = true, onConfirm }) => {
    confirmActionRef.current = onConfirm
    setConfirmDialog({ open: true, title, message, confirmText, showCancel })
  }

  const closeConfirmDialog = () => {
    confirmActionRef.current = null
    setConfirmDialog((prev) => ({ ...prev, open: false }))
  }

  // Toast notification functions
  const showToast = (message) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const showSmallConfirm = ({ title, message, onConfirm }) => {
    setSmallConfirm({ open: true, title, message, onConfirm })
  }

  const closeSmallConfirm = () => {
    setSmallConfirm({ open: false, title: '', message: '', onConfirm: null })
  }

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFolderMenu && !event.target.closest('.folder-menu-container')) {
        setShowFolderMenu(null)
      }

      if (showFileMenu && !event.target.closest('.file-menu-container')) {
        setShowFileMenu(null)
      }

      if (showNewDropdown && !event.target.closest('.dropdown') && !event.target.closest('.mobile-fab')) {
        setShowNewDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFolderMenu, showFileMenu, showNewDropdown])

  // 1. Check karna ki user pehle se login toh nahi hai
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        // Clear any login messages when session is detected
        setMessage('')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        // Clear any login messages when user logs in
        setMessage('')
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  // 2. Login function
  // 2. Login function
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)

  // 2. Login function (Send OTP)
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setLoading(false)
    if (error) {
      setMessage('❌ Error: ' + error.message)
    } else {
      setOtpSent(true)
      setMessage('✉️ OTP sent to your email!')
    }
  }

  // Verify OTP function
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    setLoading(false)

    if (error) {
      setMessage('❌ Error: ' + error.message)
    } else {
      // Session will be handled by onAuthStateChange, but we can clear message
      setMessage('✅ Login successful!')
    }
  }

  // 3. Logout function
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setFiles([])
    setMessage('')
  }

  // 4. Folders mangwane ka function (Database se)
  const fetchFolders = async () => {
    if (!session) {
      console.log('fetchFolders: No session found')
      return
    }

    console.log('fetchFolders: Starting fetch for user:', session.user.id, 'parent:', currentFolderId)

    try {
      let query = supabase
        .from('folders')
        .select('*')
        .eq('user_id', session.user.id)
        .is('deleted_at', null) // Only show non-deleted folders
        .order('created_at', { ascending: false })

      // Only add parent_id filter if currentFolderId is not null
      if (currentFolderId !== null) {
        query = query.eq('parent_id', currentFolderId)
      } else {
        // For root level, explicitly filter for null parent_id
        query = query.is('parent_id', null)
      }

      const { data, error } = await query

      if (error) {
        console.error('fetchFolders: Database error:', error)
        setMessage('❌ Error fetching folders: ' + error.message)
      } else {
        console.log('fetchFolders: Success! Data:', data)

        // Count files in each folder
        const foldersWithCounts = await Promise.all(
          (data || []).map(async (folder) => {
            const fileCount = await getFolderFileCount(folder.id)
            return { ...folder, file_count: fileCount }
          })
        )

        setFolders(foldersWithCounts)
        console.log('fetchFolders: State updated with', foldersWithCounts?.length || 0, 'folders')
      }
    } catch (err) {
      console.error('fetchFolders: Unexpected error:', err)
      setMessage('❌ Unexpected error fetching folders')
    }
  }

  // Helper function to count files in a folder
  const getFolderFileCount = async (folderId) => {
    try {
      const pathParts = await buildFolderPath(folderId)
      const folderPath = pathParts.join('/')
      const fullPath = `${session.user.id}/${folderPath}`

      const { data, error } = await supabase
        .storage
        .from('documents')
        .list(fullPath)

      if (error) {
        console.error('Error counting files:', error)
        return 0
      }

      // Filter out folders (they don't have metadata)
      const filesOnly = data?.filter(item => item.metadata) || []
      return filesOnly.length
    } catch (error) {
      console.error('Error in getFolderFileCount:', error)
      return 0
    }
  }

  // 5. Files mangwane ka function (Storage se)
  const fetchFiles = async () => {
    if (!session || currentFolderId === 'trash') return

    // Build path based on current folder hierarchy
    let folderPath = ''
    if (currentFolderId) {
      const pathParts = await buildFolderPath(currentFolderId)
      folderPath = pathParts.join('/')
    }

    const fullPath = folderPath ? `${session.user.id}/${folderPath}` : session.user.id

    const { data, error } = await supabase
      .storage
      .from('documents')
      .list(fullPath)

    if (!error) {
      // Filter out folders (they don't have metadata)
      const filesOnly = data?.filter(item => item.metadata) || []
      setFiles(filesOnly)
    }
  }

  // Helper function to build folder path from folder ID
  const buildFolderPath = async (folderId) => {
    const pathParts = []
    let currentId = folderId

    while (currentId) {
      const { data: folder } = await supabase
        .from('folders')
        .select('name, parent_id')
        .eq('id', currentId)
        .single()

      if (folder) {
        pathParts.unshift(folder.name)
        currentId = folder.parent_id
      } else {
        break
      }
    }

    return pathParts
  }

  // Update breadcrumbs when folder changes
  const updateBreadcrumbs = async () => {
    if (!currentFolderId || currentFolderId === 'trash') {
      setBreadcrumbs([])
      return
    }

    const pathParts = []
    let currentId = currentFolderId

    while (currentId) {
      const { data: folder } = await supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('id', currentId)
        .single()

      if (folder) {
        pathParts.unshift({ id: folder.id, name: folder.name })
        currentId = folder.parent_id
      } else {
        break
      }
    }

    setBreadcrumbs(pathParts)
  }


  // File download karne ke liye
  const downloadFile = async (fileName) => {
    // Build folder path
    let folderPath = ''
    if (currentFolderId) {
      const pathParts = await buildFolderPath(currentFolderId)
      folderPath = pathParts.join('/')
    }

    const downloadPath = folderPath
      ? `${session.user.id}/${folderPath}/${fileName}`
      : `${session.user.id}/${fileName}`

    const { data, error } = await supabase
      .storage
      .from('documents')
      .download(downloadPath)

    if (error) {
      setMessage('❌ Download error: ' + error.message)
    } else {
      const url = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    }
  }

  // 15. Fetch trash items
  const fetchTrash = async () => {
    if (!session) return

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', session.user.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) {
      setMessage('❌ Error fetching trash: ' + error.message)
    } else {
      setTrash(data || [])
    }
  }

  // Jab bhi currentFolderId badle, folders aur files firse mangwao
  useEffect(() => {
    if (session) {
      console.log('useEffect triggered - session exists, fetching data...')
      if (currentFolderId !== 'trash') {
        fetchFolders()
        fetchFiles()
      } else {
        fetchTrash()
      }
      updateBreadcrumbs()
    } else {
      console.log('useEffect triggered - no session')
    }
  }, [currentFolderId, session])

  // Also fetch folders when component mounts
  useEffect(() => {
    if (session && currentFolderId !== 'trash') {
      console.log('Mount effect - fetching folders...')
      fetchFolders()
    }
  }, [currentFolderId])

  // 6. File upload function
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    setMessage('📤 Uploading...')

    // Build folder path for upload
    let folderPath = ''
    if (currentFolderId) {
      const pathParts = await buildFolderPath(currentFolderId)
      folderPath = pathParts.join('/')
    }

    const uploadPath = folderPath
      ? `${session.user.id}/${folderPath}/${Date.now()}-${file.name}`
      : `${session.user.id}/${Date.now()}-${file.name}`

    const { error } = await supabase.storage.from('documents').upload(uploadPath, file)

    if (error) {
      setMessage('❌ Error: ' + error.message)
    } else {
      showToast('File uploaded successfully!')
      fetchFiles()
    }

    setUploading(false)

    if (uploadInputRef.current) {
      uploadInputRef.current.value = ''
    }
  }

  // 7. Create new folder function
  const createFolder = async () => {
    if (!newFolderName.trim()) return

    const { error } = await supabase
      .from('folders')
      .insert({
        name: newFolderName.trim(),
        user_id: session.user.id,
        parent_id: currentFolderId
      })

    if (error) {
      setMessage('❌ Error creating folder: ' + error.message)
    } else {
      showToast('Folder created successfully')
      setNewFolderName('')
      setNewFolderModal(false)

      // Small delay to ensure database is updated, then refresh
      setTimeout(() => {
        fetchFolders()
      }, 100)
    }
  }

  // 8. Navigate to folder
  const navigateToFolder = (folderId) => {
    setCurrentFolderId(folderId)
  }

  // 9. Navigate using breadcrumbs
  const navigateToBreadcrumb = (folderId) => {
    setCurrentFolderId(folderId)
  }

  // 10. Move folder to trash
  const moveToTrash = (folderId) => {
    showSmallConfirm({
      title: 'Move to Trash?',
      message: 'Are you sure you want to move this folder to Trash?',
      onConfirm: async () => {
        const { error } = await supabase
          .from('folders')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', folderId)
          .eq('user_id', session.user.id)

        if (error) {
          setMessage('❌ Error moving folder to trash: ' + error.message)
        } else {
          showToast('Folder moved to Trash')
          setShowFolderMenu(null)
          fetchFolders()
        }
        closeSmallConfirm()
      }
    })
  }

  // 11. Rename folder
  const renameFolder = async (folderId, newName) => {
    if (!newName.trim()) return

    const { error } = await supabase
      .from('folders')
      .update({ name: newName.trim() })
      .eq('id', folderId)
      .eq('user_id', session.user.id)

    if (error) {
      setMessage('❌ Error renaming folder: ' + error.message)
    } else {
      setMessage('✅ Folder renamed successfully!')
      setIsRenamingFolder(null)
      setRenameValue('')
      setShowFolderMenu(null)
      fetchFolders()
    }
  }

  // 12. Download whole folder
  const downloadFolder = async (folderId) => {
    try {
      setMessage('📥 Preparing folder download...')

      // Get folder info
      const { data: folder } = await supabase
        .from('folders')
        .select('name')
        .eq('id', folderId)
        .single()

      if (!folder) {
        setMessage('❌ Folder not found!')
        return
      }

      // Get all files in this folder
      const pathParts = await buildFolderPath(folderId)
      const fullPath = `${session.user.id}/${pathParts.join('/')}`

      const { data: files } = await supabase
        .storage
        .from('documents')
        .list(fullPath)

      if (files && files.length > 0) {
        // Download each file
        for (const file of files) {
          if (file.metadata) { // Only download actual files, not folders
            const filePath = `${fullPath}/${file.name}`
            const { data: fileData } = await supabase
              .storage
              .from('documents')
              .download(filePath)

            const url = window.URL.createObjectURL(fileData)
            const link = document.createElement('a')
            link.href = url
            link.download = file.name
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
          }
        }
        setMessage(`✅ Downloaded ${files.length} files from ${folder.name}!`)
      } else {
        setMessage('📭 No files found in this folder')
      }
    } catch (error) {
      console.error('Download folder error:', error)
      setMessage('❌ Download error: ' + error.message)
    }

    setShowFolderMenu(null)
  }

  const restoreTrashItem = (item) => {
    openConfirmDialog({
      title: 'Restore item?',
      message: `Are you sure you want to restore "${item.name}"?`,
      confirmText: 'Restore',
      onConfirm: async () => {
        if (item.item_type === 'file') {
          if (!item.trash_path || !item.original_path) {
            setMessage('❌ Missing restore path for this file')
            return
          }

          const { data: downloaded, error: downloadError } = await supabase
            .storage
            .from('documents')
            .download(item.trash_path)

          if (downloadError) {
            setMessage('❌ Error reading file from trash: ' + downloadError.message)
            return
          }

          const { error: uploadError } = await supabase
            .storage
            .from('documents')
            .upload(item.original_path, downloaded, { upsert: true })

          if (uploadError) {
            setMessage('❌ Error restoring file: ' + uploadError.message)
            return
          }

          const { error: removeError } = await supabase
            .storage
            .from('documents')
            .remove([item.trash_path])

          if (removeError) {
            setMessage('❌ File restored, but cleanup failed: ' + removeError.message)
            return
          }

          const { error: dbError } = await supabase
            .from('folders')
            .delete()
            .eq('id', item.id)
            .eq('user_id', session.user.id)

          if (dbError) {
            setMessage('❌ File restored, but trash record cleanup failed: ' + dbError.message)
            return
          }

          setMessage('✅ File restored to original location!')
          fetchTrash()
          fetchFiles()
          return
        }

        const { error } = await supabase
          .from('folders')
          .update({ deleted_at: null })
          .eq('id', item.id)
          .eq('user_id', session.user.id)

        if (error) {
          setMessage('❌ Error restoring item: ' + error.message)
        } else {
          setMessage('✅ Item restored!')
          fetchTrash()
          fetchFolders()
        }
      }
    })
  }

  const permanentlyDeleteTrashItem = async (item) => {
    if (item.item_type === 'file' && item.trash_path) {
      const { error: storageError } = await supabase
        .storage
        .from('documents')
        .remove([item.trash_path])

      if (storageError) {
        setMessage('❌ Error deleting file from storage: ' + storageError.message)
        return
      }
    }

    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', item.id)
      .eq('user_id', session.user.id)

    if (error) {
      setMessage('❌ Error deleting item: ' + error.message)
    } else {
      showToast('Item permanently deleted')
      fetchTrash()
    }
  }

  // Clear all trash items
  const clearTrash = async () => {
    if (trash.length === 0) return

    for (const item of trash) {
      if (item.item_type === 'file' && item.trash_path) {
        await supabase.storage.from('documents').remove([item.trash_path])
      }
    }

    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('user_id', session.user.id)
      .not('deleted_at', 'is', null)

    if (error) {
      setMessage('❌ Error clearing trash: ' + error.message)
    } else {
      showToast('Trash emptied')
      fetchTrash()
    }
  }



  // 16. Rename file function
  const renameFile = async (oldFileName, newFileName) => {
    if (!newFileName.trim() || oldFileName === newFileName) {
      setIsRenamingFile(null)
      setRenameValue('')
      return
    }

    try {
      setMessage('✏️ Renaming file...')

      // Build folder path
      let folderPath = ''
      if (currentFolderId) {
        const pathParts = await buildFolderPath(currentFolderId)
        folderPath = pathParts.join('/')
      }

      const oldPath = folderPath
        ? `${session.user.id}/${folderPath}/${oldFileName}`
        : `${session.user.id}/${oldFileName}`

      const newPath = folderPath
        ? `${session.user.id}/${folderPath}/${newFileName}`
        : `${session.user.id}/${newFileName}`

      // Download the file
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('documents')
        .download(oldPath)

      if (downloadError) {
        setMessage('❌ Error reading file: ' + downloadError.message)
        return
      }

      // Upload with new name
      const { error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(newPath, fileData, { upsert: false })

      if (uploadError) {
        setMessage('❌ Error renaming file: ' + uploadError.message)
        return
      }

      // Delete old file
      const { error: deleteError } = await supabase
        .storage
        .from('documents')
        .remove([oldPath])

      if (deleteError) {
        setMessage('❌ File renamed but old file cleanup failed: ' + deleteError.message)
        return
      }

      setMessage('✅ File renamed successfully!')
      setIsRenamingFile(null)
      setRenameValue('')
      setShowFileMenu(null)
      fetchFiles()
    } catch (error) {
      console.error('Rename file error:', error)
      setMessage('❌ Error renaming file: ' + error.message)
    }
  }

  // 17. Update file deletion to use trash
  const deleteFile = (fileName) => {
    showSmallConfirm({
      title: 'Move to Trash?',
      message: 'Are you sure you want to move this file to Trash?',
      onConfirm: async () => {
        // Build folder path
        let folderPath = ''
        if (currentFolderId && currentFolderId !== 'trash') {
          const pathParts = await buildFolderPath(currentFolderId)
          folderPath = pathParts.join('/')
        }

        const originalPath = folderPath
          ? `${session.user.id}/${folderPath}/${fileName}`
          : `${session.user.id}/${fileName}`

        const trashPath = `${session.user.id}/.trash/${Date.now()}-${fileName}`

        const { data: downloaded, error: downloadError } = await supabase
          .storage
          .from('documents')
          .download(originalPath)

        if (downloadError) {
          setMessage('❌ Error reading file: ' + downloadError.message)
          closeSmallConfirm()
          return
        }

        const { error: uploadError } = await supabase
          .storage
          .from('documents')
          .upload(trashPath, downloaded, { upsert: true })

        if (uploadError) {
          setMessage('❌ Error moving file to trash: ' + uploadError.message)
          closeSmallConfirm()
          return
        }

        const { error: removeOriginalError } = await supabase
          .storage
          .from('documents')
          .remove([originalPath])

        if (removeOriginalError) {
          setMessage('❌ File copied to trash, but removing original failed: ' + removeOriginalError.message)
          closeSmallConfirm()
          return
        }

        // Instead of deleting, move to trash by creating a trash record
        const { error: trashError } = await supabase
          .from('folders')
          .insert({
            name: fileName,
            user_id: session.user.id,
            parent_id: null,
            item_type: 'file',
            original_parent_id: currentFolderId,
            original_path: originalPath,
            trash_path: trashPath,
            deleted_at: new Date().toISOString(),
            file_count: 1
          })

        if (trashError) {
          setMessage('❌ Error moving file to trash: ' + trashError.message)
          closeSmallConfirm()
          return
        }

        showToast('File moved to Trash')
        setShowFileMenu(null)
        fetchFiles()
        closeSmallConfirm()
      }
    })
  }

  // --- AGAR USER LOGIN NAHI HAI TO YE DIKHAO ---
  if (!session) {
    return (
      <div className="login-container">
        <div className="login-content">
          <h1 className="login-title">🔐 Study Vault 🔐</h1>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <div className="feature-text">Secure</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <div className="feature-text">Fast</div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔐</div>
              <div className="feature-text">Encrypted</div>
            </div>
          </div>

          <div className="login-section">
            <h3 className="login-heading">🌐 Access Portal 🌐</h3>
            {/* Conditional Form: Login or OTP */}
            {!otpSent ? (
              <form onSubmit={handleLogin} className="login-form">
                <input
                  type="email"
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="email-input"
                  required
                  disabled={loading}
                />
                <button type="submit" className="btn-login" disabled={loading}>
                  {loading ? 'Sending...' : '🚀 SEND OTP 🚀'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="login-form">
                <p style={{ color: '#39ff14', fontSize: '14px', textAlign: 'center' }}>Enter the code sent to {email}</p>
                <input
                  type="text"
                  placeholder="Enter 6-digit OTP code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="email-input"
                  required
                  autoFocus
                  disabled={loading}
                />
                <button type="submit" className="btn-login" disabled={loading}>
                  {loading ? 'Verifying...' : '� VERIFY OTP 🔐'}
                </button>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    marginTop: '10px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Change email
                </button>
              </form>
            )}
            {message && <p className="message">{message}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Mobile Header with Hamburger */}
      <div className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-icon">{isMobileSidebarOpen ? '✕' : '☰'}</span>
        </button>
        <h2 className="mobile-title">📂 Study Vault</h2>
        <div className="mobile-spacer"></div>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {isMobileSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMobileSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`sidebar ${isMobileSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>📂 Study Vault</h2>
          <button
            className="sidebar-close-btn"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="sidebar-content">
          <div className="new-section">
            <div className="dropdown">
              <button
                className="btn-new"
                onClick={() => setShowNewDropdown(!showNewDropdown)}
              >
                ➕ New
              </button>

              {showNewDropdown && (
                <div className="dropdown-menu">
                  <button
                    onClick={() => {
                      setNewFolderModal(true)
                      setShowNewDropdown(false)
                    }}
                    className="dropdown-item"
                  >
                    📁 New Folder
                  </button>
                  <label className="dropdown-item">
                    📄 Upload File
                    <input
                      type="file"
                      onChange={(e) => {
                        handleUpload(e)
                        setShowNewDropdown(false)
                      }}
                      disabled={uploading}
                      className="file-input-hidden"
                      ref={uploadInputRef}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="nav-section">
            <button
              className={`nav-item ${currentFolderId !== 'trash' ? 'active' : ''}`}
              onClick={() => {
                setCurrentFolderId(null)
                setIsMobileSidebarOpen(false)
              }}
            >
              📁 My Files
            </button>
            <button
              className={`nav-item ${currentFolderId === 'trash' ? 'active' : ''}`}
              onClick={() => {
                setCurrentFolderId('trash')
                setIsMobileSidebarOpen(false)
              }}
            >
              🗑️ Trash
            </button>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-email">{session.user.email}</div>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {currentFolderId === 'trash' ? (
          <div className="trash-section" style={{ padding: '24px 32px' }}>
            <div className="trash-header">
              <h3 style={{ color: '#39ff14', fontSize: '18px', marginBottom: '16px' }}>🗑️ Trash ({trash.length} items)</h3>
              {trash.length > 0 && (
                <button onClick={clearTrash} className="btn-clear-trash" style={{
                  background: 'rgba(255, 50, 50, 0.2)',
                  color: '#ff4444',
                  border: '1px solid #ff4444',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  🗑️ Empty Trash
                </button>
              )}
            </div>

            {trash.length > 0 ? (
              <div className="files-list">
                {trash.map((item) => (
                  <div key={item.id} className="file-item">
                    <div className="file-icon">{item.item_type === 'folder' ? '📁' : '📄'}</div>
                    <div className="file-info">
                      <div className="file-name">{item.name}</div>
                      <div className="file-date">
                        Deleted: {new Date(item.deleted_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="file-actions">
                      <button onClick={() => restoreTrashItem(item)} className="btn-download" title="Restore">
                        ↩️
                      </button>
                      <button onClick={() => permanentlyDeleteTrashItem(item)} className="btn-delete" title="Delete Permanently">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                <p style={{ fontSize: '48px', marginBottom: '16px' }}>📭</p>
                <p>Trash is empty</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Content Header (Breadcrumbs) */}
            <div className="content-header">
              <div className="breadcrumb">
                <div
                  className="breadcrumb-item"
                  onClick={() => navigateToFolder(null)}
                >
                  🏠 Home
                </div>
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="breadcrumb-separator">/</span>
                    <div
                      className="breadcrumb-item"
                      onClick={() => navigateToBreadcrumb(crumb.id)}
                    >
                      {crumb.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Content Body Unified List View */}
            <div className="content-body" style={{ padding: 0 }}>
              {/* List Header */}
              <div className="list-header">
                <div className="list-header-item">Name</div>
                <div className="list-header-item">Owner</div>
                <div className="list-header-item">Date Modified</div>
                <div className="list-header-item">File size</div>
                <div className="list-header-item"></div>
              </div>

              {/* Combined List Items */}
              <div className="list-view-container">
                {folders.length === 0 && files.length === 0 ? (
                  <div className="empty-state">
                    <p>📭 This folder is empty</p>
                  </div>
                ) : (
                  <>
                    {/* Render Folders first */}
                    {folders.map(folder => (
                      <div
                        key={`folder-${folder.id}`}
                        className="list-row"
                        onDoubleClick={() => navigateToFolder(folder.id)}
                        onClick={() => {
                          if (window.innerWidth <= 768) navigateToFolder(folder.id)
                        }}
                      >
                        <div className="list-cell name-cell">
                          <div className="list-icon">📁</div>
                          {isRenamingFolder === folder.id ? (
                            <input
                              type="text"
                              className="folder-input-modal"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameFolder(folder.id, renameValue)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              onBlur={() => setIsRenamingFolder(null)}
                            />
                          ) : (
                            <span>{folder.name}</span>
                          )}
                        </div>
                        <div className="list-cell secondary-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#39ff14', color: 'black', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>me</div>
                            me
                          </div>
                        </div>
                        <div className="list-cell secondary-cell">
                          {new Date(folder.created_at).toLocaleDateString()}
                        </div>
                        <div className="list-cell secondary-cell">
                          —
                        </div>
                        <div className="list-cell action-cell" onClick={(e) => e.stopPropagation()}>
                          <div className="folder-menu-container">
                            <button
                              className="list-action-btn"
                              onClick={() => setShowFolderMenu(showFolderMenu === folder.id ? null : folder.id)}
                            >
                              ⋮
                            </button>
                            {showFolderMenu === folder.id && (
                              <div className="dropdown-menu" style={{ right: 0 }}>
                                <button
                                  className="dropdown-item"
                                  onClick={() => {
                                    setIsRenamingFolder(folder.id)
                                    setRenameValue(folder.name)
                                    setShowFolderMenu(null)
                                  }}
                                >
                                  ✏️ Rename
                                </button>
                                <button
                                  className="dropdown-item"
                                  onClick={() => downloadFolder(folder.id)}
                                >
                                  📥 Download
                                </button>
                                <button
                                  className="dropdown-item"
                                  style={{ color: '#ff4444' }}
                                  onClick={() => moveToTrash(folder.id)}
                                >
                                  🗑️ Move to Trash
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Render Files next */}
                    {files.map(file => (
                      <div key={`file-${file.name}`} className="list-row">
                        <div className="list-cell name-cell">
                          <div className="list-icon">
                            {file.metadata?.mimetype?.includes('image') ? '🖼️' : '📄'}
                          </div>
                          {isRenamingFile === file.name ? (
                            <input
                              type="text"
                              className="file-input-modal"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameFile(file.name, renameValue)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              onBlur={() => setIsRenamingFile(null)}
                            />
                          ) : (
                            <span>{file.name}</span>
                          )}
                        </div>
                        <div className="list-cell secondary-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#39ff14', color: 'black', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>me</div>
                            me
                          </div>
                        </div>
                        <div className="list-cell secondary-cell">
                          {new Date(file.created_at).toLocaleDateString()}
                        </div>
                        <div className="list-cell secondary-cell">
                          {(file.metadata?.size / 1024).toFixed(1)} KB
                        </div>
                        <div className="list-cell action-cell">
                          <div className="file-menu-container">
                            <button
                              className="list-action-btn"
                              onClick={() => setShowFileMenu(showFileMenu === file.name ? null : file.name)}
                            >
                              ⋮
                            </button>
                            {showFileMenu === file.name && (
                              <div className="dropdown-menu" style={{ right: 0 }}>
                                <button
                                  className="dropdown-item"
                                  onClick={() => downloadFile(file.name)}
                                >
                                  📥 Download
                                </button>
                                <button
                                  className="dropdown-item"
                                  onClick={() => {
                                    setIsRenamingFile(file.name)
                                    setRenameValue(file.name)
                                    setShowFileMenu(null)
                                  }}
                                >
                                  ✏️ Rename
                                </button>
                                <button
                                  className="dropdown-item"
                                  style={{ color: '#ff4444' }}
                                  onClick={() => deleteFile(file.name)}
                                >
                                  🗑️ Move to Trash
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className="toast" onClick={() => removeToast(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* New Folder Modal */}
      {newFolderModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Folder</h3>
            <div style={{ padding: '16px 24px' }}>
              <input
                type="text"
                placeholder="Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="folder-input-modal"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setNewFolderModal(false)} className="btn-cancel">Cancel</button>
              <button onClick={createFolder} className="btn-create">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog.open && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{confirmDialog.title}</h3>
            <div style={{ padding: '0 24px' }}>
              <p>{confirmDialog.message}</p>
            </div>
            <div className="modal-actions">
              {confirmDialog.showCancel && (
                <button onClick={closeConfirmDialog} className="btn-cancel">Cancel</button>
              )}
              <button
                onClick={() => {
                  if (confirmActionRef.current) confirmActionRef.current()
                  closeConfirmDialog()
                }}
                className="btn-create"
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Small Confirm Dialog */}
      {smallConfirm.open && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{smallConfirm.title}</h3>
            <div style={{ padding: '0 24px' }}>
              <p>{smallConfirm.message}</p>
            </div>
            <div className="modal-actions">
              <button onClick={closeSmallConfirm} className="btn-cancel">Cancel</button>
              <button
                onClick={() => {
                  if (smallConfirm.onConfirm) smallConfirm.onConfirm()
                  // closeSmallConfirm is called inside the onConfirm usually, but here just in case
                }}
                className="btn-create"
                style={{ background: '#ff4444', color: 'white' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App