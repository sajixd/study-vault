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
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showFolderMenu, setShowFolderMenu] = useState(null) // Which folder menu is open
  const [showFileMenu, setShowFileMenu] = useState(null) // Which file menu is open
  const [isRenamingFolder, setIsRenamingFolder] = useState(null) // Which folder is being renamed
  const [isRenamingFile, setIsRenamingFile] = useState(null) // Which file is being renamed
  const [renameValue, setRenameValue] = useState('') // New name for folder/file
  const [trash, setTrash] = useState([]) // Deleted items
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false) // Mobile sidebar state

  const confirmActionRef = useRef(null)
  const uploadInputRef = useRef(null)
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
  const handleLogin = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setMessage('❌ Error: ' + error.message)
    } else {
      setMessage('✉️ Check your email — a magic link has been sent!')
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

  // Jab bhi currentFolderId badle, folders aur files firse mangwao
  useEffect(() => {
    if (session) {
      console.log('useEffect triggered - session exists, fetching data...')
      // Only fetch folders if not in trash
      if (currentFolderId !== 'trash') {
        fetchFolders()
      }
      fetchFiles()
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
      setMessage('✅ File uploaded successfully!')
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
      setMessage('✅ Folder created successfully!')
      setNewFolderName('')
      setIsCreatingFolder(false)
      
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
    openConfirmDialog({
      title: 'Move folder to Trash?',
      message: 'Are you sure you want to move this folder to Trash?',
      confirmText: 'Move to Trash',
      onConfirm: async () => {
        const { error } = await supabase
          .from('folders')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', folderId)
          .eq('user_id', session.user.id)

        if (error) {
          setMessage('❌ Error moving folder to trash: ' + error.message)
        } else {
          setMessage('✅ Folder moved to Trash!')
          setShowFolderMenu(null)
          fetchFolders()
        }
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

  const permanentlyDeleteTrashItem = (item) => {
    openConfirmDialog({
      title: 'Delete permanently?',
      message: `This will permanently delete "${item.name}". This cannot be undone.`,
      confirmText: 'Delete permanently',
      onConfirm: async () => {
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
          setMessage('✅ Item permanently deleted!')
          fetchTrash()
        }
      }
    })
  }

  // 13. Show folder details
  const showFolderDetails = (folder) => {
    const createdDate = new Date(folder.created_at).toLocaleString()
    const accessedDate = new Date(folder.last_accessed || folder.created_at).toLocaleString()

    openConfirmDialog({
      title: 'Folder details',
      message: `Name: ${folder.name}\nCreated: ${createdDate}\nLast opened: ${accessedDate}\nFiles: ${folder.file_count || 0}`,
      confirmText: 'Close',
      showCancel: false,
      onConfirm: async () => {}
    })

    setShowFolderMenu(null)
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
    openConfirmDialog({
      title: 'Move file to Trash?',
      message: 'Are you sure you want to move this file to Trash?',
      confirmText: 'Move to Trash',
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
          return
        }

        const { error: uploadError } = await supabase
          .storage
          .from('documents')
          .upload(trashPath, downloaded, { upsert: true })

        if (uploadError) {
          setMessage('❌ Error moving file to trash: ' + uploadError.message)
          return
        }

        const { error: removeOriginalError } = await supabase
          .storage
          .from('documents')
          .remove([originalPath])

        if (removeOriginalError) {
          setMessage('❌ File copied to trash, but removing original failed: ' + removeOriginalError.message)
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
          return
        }

        setMessage('✅ File moved to Trash!')
        fetchFiles()
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
            <form onSubmit={handleLogin} className="login-form">
              <input 
                type="email" 
                placeholder="Enter your email address..." 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="email-input"
                required
              />
              <button type="submit" className="btn-login">
                🚀 SEND MAGIC LINK 🚀
              </button>
            </form>
            {message && <p className="message">{message}</p>}
          </div>
        </div>
      </div>
    )
  }

  // --- AGAR USER LOGIN HAI TO APP DIKHAO ---
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
                      setIsCreatingFolder(true)
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
                    />
                  </label>
                </div>
              )}
            </div>

            <button
              className="btn-upload"
              type="button"
              onClick={() => {
                if (uploadInputRef.current) {
                  uploadInputRef.current.click()
                }
              }}
              disabled={uploading}
            >
              ⬆️ Upload
            </button>

            <input
              ref={uploadInputRef}
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              className="file-input-hidden"
            />
          </div>
          
          <div className="nav-section">
            <button 
              onClick={() => {
                setCurrentFolderId(null)
                setIsMobileSidebarOpen(false)
              }}
              className={`nav-item ${!currentFolderId ? 'active' : ''}`}
            >
              🏠 My Drive
            </button>
            <button 
              onClick={() => {
                setCurrentFolderId('trash')
                // Clear folders and files when going to trash
                setFolders([])
                setFiles([])
                fetchTrash()
                setIsMobileSidebarOpen(false)
              }}
              className="nav-item"
            >
              🗑️ Trash
            </button>
          </div>
        </div>
        
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-email">👤 {session.user.email}</span>
            <button onClick={handleLogout} className="btn-logout">⚡ LOGOUT</button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Header with Breadcrumbs */}
        <div className="content-header">
          <div className="breadcrumb">
            {currentFolderId === 'trash' ? (
              <span>🗑️ Trash</span>
            ) : (
              <>
                <button 
                  onClick={() => setCurrentFolderId(null)}
                  className="breadcrumb-item"
                >
                  🏠 My Drive
                </button>
                
                {breadcrumbs.map((crumb, index) => (
                  <span key={crumb.id}>
                    <span className="breadcrumb-separator">/</span>
                    <button 
                      onClick={() => navigateToBreadcrumb(crumb.id)}
                      className="breadcrumb-item"
                    >
                      📁 {crumb.name}
                    </button>
                  </span>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Create Folder Section */}
        {isCreatingFolder && currentFolderId !== 'trash' && (
          <div className="create-folder-section">
            <input 
              type="text" 
              placeholder="Folder name..." 
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="folder-input"
              autoFocus
            />
            <button 
              onClick={createFolder}
              className="btn-create"
            >
              ✅ Create
            </button>
            <button 
              onClick={() => {
                setIsCreatingFolder(false)
                setNewFolderName('')
              }}
              className="btn-cancel"
            >
              ❌ Cancel
            </button>
          </div>
        )}


        {/* Message Display */}
        {message && <div className="message">{message}</div>}

        {confirmDialog.open && (
          <div className="modal-overlay" onClick={closeConfirmDialog}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">{confirmDialog.title}</h3>
              </div>
              <div className="modal-body">
                {String(confirmDialog.message)
                  .split('\n')
                  .map((line, idx) => (
                    <p key={idx} className="modal-text">{line}</p>
                  ))}
              </div>
              <div className="modal-actions">
                {confirmDialog.showCancel && (
                  <button className="btn-cancel" onClick={closeConfirmDialog}>
                    Cancel
                  </button>
                )}
                <button
                  className="btn-create"
                  onClick={async () => {
                    try {
                      if (typeof confirmActionRef.current === 'function') {
                        await confirmActionRef.current()
                      }
                    } finally {
                      closeConfirmDialog()
                    }
                  }}
                >
                  {confirmDialog.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trash View */}
        {currentFolderId === 'trash' ? (
          <div className="trash-section">
            <h3>🗑️ Trash ({trash.length}) items</h3>
            {trash.length > 0 ? (
              <div className="files-list">
                {trash.map((item) => (
                  <div key={item.id} className="file-item">
                    <div className="file-icon">🗑️</div>
                    <div className="file-info">
                      <div className="file-name">{item.name}</div>
                      <div className="file-date">
                        {new Date(item.deleted_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="file-actions">
                      <button onClick={() => restoreTrashItem(item)} className="btn-download">
                        ↩️ Restore
                      </button>
                      <button onClick={() => permanentlyDeleteTrashItem(item)} className="btn-delete">
                        🗑️ Delete permanently
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>📭 Trash is empty</p>
                <p>Items you delete will appear here</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Folders Grid */}
            {folders.length > 0 && (
              <div className="folders-section">
                <h3>📁 Folders ({folders.length})</h3>
                <div className="folders-grid">
                  {folders.map((folder) => (
                    <div 
                      key={folder.id}
                      className="folder-card"
                      onClick={() => {
                        navigateToFolder(folder.id)
                        updateLastAccessed(folder.id)
                      }}
                    >
                      <div className="folder-header">
                        <div className="folder-icon">📁</div>
                        <div className="folder-info-wrapper">
                          {isRenamingFolder === folder.id ? (
                            <div className="folder-rename">
                              <input 
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    renameFolder(folder.id, renameValue)
                                  } else if (e.key === 'Escape') {
                                    setIsRenamingFolder(null)
                                    setRenameValue('')
                                  }
                                }}
                                className="folder-rename-input"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  renameFolder(folder.id, renameValue)
                                }}
                                className="rename-confirm"
                              >
                                ✅
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="folder-name">{folder.name}</div>
                              <div className="folder-file-count">
                                {folder.file_count === 0 ? '📭 Empty' : `${folder.file_count} ${folder.file_count === 1 ? 'File' : 'Files'}`}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="folder-menu-container">
                          <button 
                            className="folder-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowFolderMenu(showFolderMenu === folder.id ? null : folder.id)
                            }}
                          >
                            ⋮
                          </button>
                          
                          {showFolderMenu === folder.id && (
                            <div className="folder-menu">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  downloadFolder(folder.id)
                                }}
                                className="menu-item"
                              >
                                📥 Download folder
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setIsRenamingFolder(folder.id)
                                  setRenameValue(folder.name)
                                  setShowFolderMenu(null)
                                }}
                                className="menu-item"
                              >
                                ✏️ Rename
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveToTrash(folder.id)
                                }}
                                className="menu-item trash"
                              >
                                🗑️ Move to trash
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  showFolderDetails(folder)
                                }}
                                className="menu-item"
                              >
                                ℹ️ Details
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="folder-date">
                        {new Date(folder.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files List */}
            <div className="files-section">
              <h3>📄 Files ({files.length})</h3>
              {files.length > 0 ? (
                <div className="files-list">
                  {files.map((file) => (
                    <div key={file.name} className="file-item">
                      <div className="file-icon">📄</div>
                      <div className="file-info">
                        {isRenamingFile === file.name ? (
                          <div className="file-rename">
                            <input 
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  renameFile(file.name, renameValue)
                                } else if (e.key === 'Escape') {
                                  setIsRenamingFile(null)
                                  setRenameValue('')
                                }
                              }}
                              className="file-rename-input"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation()
                                renameFile(file.name, renameValue)
                              }}
                              className="rename-confirm"
                            >
                              ✅
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation()
                                setIsRenamingFile(null)
                                setRenameValue('')
                              }}
                              className="rename-cancel"
                            >
                              ❌
                            </button>
                          </div>
                        ) : (
                          <div className="file-name">{file.name}</div>
                        )}
                      </div>

                      <div className="file-menu-container">
                        <button
                          className="file-menu-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowFileMenu(showFileMenu === file.name ? null : file.name)
                          }}
                        >
                          ⋮
                        </button>

                        {showFileMenu === file.name && (
                          <div className="file-menu">
                            <button
                              className="menu-item"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowFileMenu(null)
                                downloadFile(file.name)
                              }}
                            >
                              ⬇️ Download
                            </button>
                            <button
                              className="menu-item"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setIsRenamingFile(file.name)
                                setRenameValue(file.name)
                                setShowFileMenu(null)
                              }}
                            >
                              ✏️ Rename
                            </button>
                            <button
                              className="menu-item trash"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowFileMenu(null)
                                deleteFile(file.name)
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                folders.length === 0 && (
                  <div className="empty-state">
                    <p>📭 No files in this folder yet.</p>
                    <p>Click "New" to upload files or create folders!</p>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App