import React, { useState, useEffect } from 'react'; // 必须导入 React 钩子
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, MessageIcon } from '@react-pdf-viewer/highlight';
import api from '../utils/api'; // 必须导入 API 工具
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

export default function PdfReader({ bookId, onClose }) {
  const [highlights, setHighlights] = useState([]);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // 1. 初始化加载标注和进度
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        const { data } = await api.get(`/books/annotations/${bookId}`);
        setHighlights(data.highlights || []);
        setLastPage(data.last_page || 1);
      } catch (err) {
        console.error("加载标注失败", err);
      } finally {
        setLoading(false);
      }
    };
    loadAnnotations();
  }, [bookId]);

  // 2. 保存功能
  const saveToServer = async (newPage, newHighlights) => {
    try {
      await api.post('/books/annotations', {
        book_id: bookId,
        last_page: newPage || lastPage,
        highlights: newHighlights || highlights
      });
    } catch (err) {
      console.error("保存进度失败", err);
    }
  };

  const highlightPluginInstance = highlightPlugin({
    renderHighlightTarget: (props) => (
      <div style={{ background: '#ffee00', padding: '2px', borderRadius: '4px', cursor: 'pointer' }} onClick={props.toggle}>
        <MessageIcon /> 标注
      </div>
    ),
    onHighlightCreate: (highlight) => {
      const updated = [...highlights, highlight];
      setHighlights(updated);
      saveToServer(lastPage, updated);
    }
  });

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  if (loading) return <div className="pdf-reader-overlay"><div className="spinner">Loading Book...</div></div>;

  return (
    <div className="pdf-reader-overlay">
      <div className="reader-header">
        <button className="btn-sm" onClick={onClose}>✕ Close Reader</button>
        <span style={{ color: 'white', marginLeft: '15px' }}>Reading Mode</span>
      </div>
      <div className="pdf-viewer-container">
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
          <Viewer 
            // fileUrl={`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/books/view/${bookId}`} 
            fileUrl={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/books/view/${bookId}`}
            plugins={[defaultLayoutPluginInstance, highlightPluginInstance]}
            initialPage={lastPage - 1}
            httpHeaders={{
                Authorization: `Bearer ${localStorage.getItem('token')}` 
            }}
            onPageChange={(e) => {
              setLastPage(e.currentPage + 1);
              saveToServer(e.currentPage + 1, highlights);
            }}
          />
        </Worker>
      </div>
    </div>
  );
}