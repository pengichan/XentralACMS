import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function FileBox() {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (e) {
      console.error('Failed to load files', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    // Check size limit: 50MB
    const limit = 50 * 1024 * 1024;
    if (selectedFile.size > limit) {
      alert('File size exceeds the 50MB limit.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('uploadedBy', user?.userId || 'UNKNOWN');

    try {
      const res = await fetch('http://localhost:8080/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setSelectedFile(null);
        // Clear file input
        const fileInput = document.getElementById('file-upload-input');
        if (fileInput) fileInput.value = '';
        fetchFiles();
      } else {
        const txt = await res.text();
        alert(`Upload failed: ${txt || 'An error occurred.'}`);
      }
    } catch (err) {
      console.error('Upload error', err);
      alert('Failed to connect to upload service.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (fileId, filename) => {
    if (!user?.userId) return;
    const downloadUrl = `http://localhost:8080/api/files/download/${fileId}?userId=${encodeURIComponent(user.userId)}`;
    
    // Create an anchor element to trigger download programmatically
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Are you sure you want to delete this file from the shared box?')) return;
    try {
      const res = await fetch(`http://localhost:8080/api/files/${fileId}?userId=${encodeURIComponent(user?.userId || '')}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchFiles();
      } else {
        alert('Failed to delete file.');
      }
    } catch (e) {
      console.error('Delete file error', e);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ padding: '1rem', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Title Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#fff' }}>
          📤 Audited Shared File Box
        </h1>
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
          Securely transfer files between your local PC and remote active sessions. 
          <span style={{ color: '#ffcb42', fontWeight: 600 }}> All uploads and downloads are fully logged in the system Audit Trail.</span>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
        {/* Files List Panel */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '1.5rem',
          minHeight: '400px',
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Shared Files Repository</h3>
          
          {loading && files.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.5)', padding: '2rem', textAlign: 'center' }}>Loading file repository...</div>
          ) : files.length === 0 ? (
            <div style={{
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '4rem 2rem',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '0.9rem'
            }}>
              No files currently stored. Use the upload panel to share files.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Filename</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Size</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Uploaded By</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Uploaded At</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr 
                      key={f.id} 
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '0.8rem 0.5rem', fontWeight: 500, color: '#fff', wordBreak: 'break-all' }}>
                        📄 {f.filename}
                      </td>
                      <td style={{ padding: '0.8rem 0.5rem', color: 'rgba(255,255,255,0.7)' }}>
                        {formatBytes(f.fileSize)}
                      </td>
                      <td style={{ padding: '0.8rem 0.5rem', color: '#ffcb42', fontWeight: 500 }}>
                        {f.uploadedBy}
                      </td>
                      <td style={{ padding: '0.8rem 0.5rem', color: 'rgba(255,255,255,0.5)' }}>
                        {new Date(f.uploadedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleDownload(f.id, f.filename)}
                            style={{
                              background: '#4facfe',
                              color: '#fff',
                              border: 'none',
                              padding: '0.35rem 0.8rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '0.78rem'
                            }}
                          >
                            ⬇ Download
                          </button>
                          <button
                            onClick={() => handleDelete(f.id)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '0.35rem 0.6rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.78rem'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upload Panel */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Upload File</h3>
          
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div style={{
              border: '2px dashed rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '1.5rem 1rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.2)',
              position: 'relative'
            }}>
              <span style={{ fontSize: '2rem' }}>📤</span>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                {selectedFile ? selectedFile.name : 'Select file to upload'}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                Max size: 50MB
              </p>
              <input
                id="file-upload-input"
                type="file"
                onChange={handleFileChange}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                  width: '100%',
                  height: '100%'
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              style={{
                background: uploading || !selectedFile ? 'rgba(255,255,255,0.1)' : '#10b981',
                color: uploading || !selectedFile ? 'rgba(255,255,255,0.4)' : '#fff',
                border: 'none',
                padding: '0.65rem 1rem',
                borderRadius: '6px',
                cursor: selectedFile && !uploading ? 'pointer' : 'default',
                fontWeight: 'bold',
                fontSize: '0.88rem',
                textAlign: 'center',
                boxShadow: selectedFile && !uploading ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
                transition: 'background 0.2s'
              }}
            >
              {uploading ? 'Uploading File...' : 'Upload to Shared Box'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', background: 'rgba(255, 203, 66, 0.05)', border: '1px solid rgba(255, 203, 66, 0.15)', borderRadius: '8px', padding: '0.8rem', fontSize: '0.78rem', color: '#ffcb42', lineHeight: 1.4 }}>
            💡 **RDP Transfer Tip**: Upload files here from your local PC. Then, inside your browser RDP session, open the web portal and click download. To copy out of RDP, simply do the reverse!
          </div>
        </div>
      </div>
    </div>
  );
}
