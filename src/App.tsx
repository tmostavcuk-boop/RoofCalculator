import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize, LayoutGrid, 
  PlusCircle, Trash2, ArrowRight, Undo, 
  Settings, Calculator,
  MousePointer2, ChevronRight, Focus, Grid3X3, Columns, AlignJustify, MoreHorizontal,
  Ruler, Info, Sparkles, X, Send, MessageSquare, Loader2,
  Square, Scissors, Layers, ChevronDown, ChevronUp, FileText,
  MinusSquare, Move, TrendingUp, TrendingDown, Minus, ArrowUpDown, Crosshair,
  Plus, Download, ArrowUp, ArrowDown, ArrowLeft, LayoutTemplate,
  Copy, Edit2, Check, Split
} from 'lucide-react';

// Додаємо інструменти для Android
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@cap-browser/file-opener';
import { jsPDF } from 'jspdf';

// --- Types ---
type AppStep = 'material' | 'geometry' | 'layout';
type MaterialType = 'tile' | 'profile' | 'siding' | 'picket';
type PicketProfile = 'straight' | 'convex' | 'concave';

interface Point { x: number; y: number; }

interface MaterialParams {
  type: MaterialType;
  name: string;
  totalWidth: number;
  effectiveWidth: number;
  maxLength: number;
  gap?: number;
  overlap?: number;
  picketProfile?: PicketProfile;
  archHeight?: number;
}

interface Sheet {
  id: string;
  x: number;
  y: number;
  width: number;
  length: number;
  label: number;
  fullLength: number;
  color: string;
  row: number;
}

interface RoofSlope {
  id: string;
  name: string;
  vertices: Point[];
  holes: Point[][];
  verticalGuides: number[]; 
  sheets: Sheet[];
  layoutOffset: { x: number, y: number };
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// --- Constants ---
const COLORS = ['#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'];

const MATERIAL_PRESETS: Record<MaterialType, MaterialParams> = {
  tile: { type: 'tile', name: 'Металочерепиця', totalWidth: 1180, effectiveWidth: 1100, maxLength: 4000, overlap: 150 },
  profile: { type: 'profile', name: 'Профнастил', totalWidth: 1160, effectiveWidth: 1100, maxLength: 6000, overlap: 150 },
  siding: { type: 'siding', name: 'Сайдинг', totalWidth: 230, effectiveWidth: 200, maxLength: 3660, overlap: 50 },
  picket: { type: 'picket', name: 'Штахетник', totalWidth: 115, effectiveWidth: 135, maxLength: 2000, gap: 20, overlap: 0, picketProfile: 'straight', archHeight: 300 }
};

const ROOF_TEMPLATES = [
  { id: 'rect', name: 'Прямокутник', points: [{x:-2000,y:0}, {x:-2000,y:3000}, {x:2000,y:3000}, {x:2000,y:0}] },
  { id: 'trap', name: 'Трапеція', points: [{x:-2500,y:0}, {x:-1500,y:3000}, {x:1500,y:3000}, {x:2500,y:0}] },
  { id: 'tri', name: 'Трикутник', points: [{x:-2000,y:0}, {x:0,y:3500}, {x:2000,y:0}] },
];

// --- Components ---
const GridBackground = React.memo(() => (
  <pattern id="grid" width="1000" height="1000" patternUnits="userSpaceOnUse" x="0" y="0">
    <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="#94A3B8" strokeWidth="1" strokeOpacity="0.3"/>
  </pattern>
));

const callGemini = async (prompt: string, context: string) => {
  return "Функція AI тимчасово обмежена для стабільності PDF.";
};

export default function App() {
  const [step, setStep] = useState<AppStep>('material');
  const [material, setMaterial] = useState<MaterialParams>(MATERIAL_PRESETS.tile);
  
  const [slopes, setSlopes] = useState<RoofSlope[]>([{
    id: 'slope-1',
    name: 'Схил 1',
    vertices: [{ x: -3000, y: 0 }, { x: -1000, y: 3000 }, { x: 1000, y: 3000 }, { x: 3000, y: 0 }],
    holes: [],
    verticalGuides: [],
    sheets: [],
    layoutOffset: { x: 0, y: 0 }
  }]);
  const [activeSlopeId, setActiveSlopeId] = useState<string>('slope-1');
  const [isRenamingSlope, setIsRenamingSlope] = useState(false);
  const [tempSlopeName, setTempSlopeName] = useState("");

  const activeSlopeIndex = useMemo(() => slopes.findIndex(s => s.id === activeSlopeId), [slopes, activeSlopeId]);
  const activeSlope = slopes[activeSlopeIndex];

  const updateActiveSlope = useCallback((updater: (slope: RoofSlope) => Partial<RoofSlope>) => {
    setSlopes(prev => {
      const newSlopes = [...prev];
      const idx = newSlopes.findIndex(s => s.id === activeSlopeId);
      if (idx !== -1) {
        newSlopes[idx] = { ...newSlopes[idx], ...updater(newSlopes[idx]) };
      }
      return newSlopes;
    });
  }, [activeSlopeId]);

  const vertices = activeSlope.vertices;
  const holes = activeSlope.holes;
  const sheets = activeSlope.sheets;
  const layoutOffset = activeSlope.layoutOffset;
  const verticalGuides = activeSlope.verticalGuides || [];

  const setVertices = (val: Point[] | ((p: Point[]) => Point[])) => {
    updateActiveSlope(s => ({ vertices: typeof val === 'function' ? val(s.vertices) : val }));
  };
  const setHoles = (val: Point[][] | ((p: Point[][]) => Point[][])) => {
    updateActiveSlope(s => ({ holes: typeof val === 'function' ? val(s.holes) : val }));
  };
  const setSheets = (val: Sheet[] | ((p: Sheet[]) => Sheet[])) => {
    updateActiveSlope(s => ({ sheets: typeof val === 'function' ? val(s.sheets) : val }));
  };
  const setLayoutOffset = (val: {x:number, y:number} | ((p: {x:number, y:number}) => {x:number, y:number})) => {
    updateActiveSlope(s => ({ layoutOffset: typeof val === 'function' ? val(s.layoutOffset) : val }));
  };
  const setVerticalGuides = (val: number[] | ((p: number[]) => number[])) => {
    updateActiveSlope(s => ({ verticalGuides: typeof val === 'function' ? val(s.verticalGuides || []) : val }));
  };

  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [activeElement, setActiveElement] = useState<{ polyIndex: number, vertIndex: number } | null>(null);
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ polyIndex: number, vertIndex: number } | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{ polyIndex: number, vertIndex: number } | null>(null); 
  const [isEditingHeight, setIsEditingHeight] = useState(false);
  const [manualLength, setManualLength] = useState<string>("");
  const [isAddingGuide, setIsAddingGuide] = useState(false);
  const [newGuideX, setNewGuideX] = useState<string>("");
  const [selectedGuideIndex, setSelectedGuideIndex] = useState<number | null>(null);
  
  const [uiScale, setUiScale] = useState(1);
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false); 

  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ x: 0, y: 0, scale: 0.05 });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const selectedSheet = useMemo(() => sheets.find(s => s.id === selectedSheetId), [sheets, selectedSheetId]);

  const toSvg = (p: Point) => ({ x: p.x, y: -p.y });
  const fromSvg = (p: Point) => ({ x: p.x, y: -p.y });

  const getPolyArea = (points: Point[]) => {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      a += points[i].x * points[j].y;
      a -= points[j].x * points[i].y;
    }
    return Math.abs(a) / 2 / 1000000;
  };

  const getCentroid = (points: Point[]) => {
      if (points.length === 0) return {x:0,y:0};
      let x = 0, y = 0;
      points.forEach(p => { x+=p.x; y+=p.y; });
      return { x: x/points.length, y: y/points.length };
  };

  const polygonArea = useMemo(() => {
    const outer = getPolyArea(vertices);
    const inner = holes.reduce((acc, h) => acc + getPolyArea(h), 0);
    return Math.max(0, outer - inner);
  }, [vertices, holes]);

  const sheetsArea = useMemo(() => {
      return sheets.reduce((acc, s) => acc + (s.width * s.length / 1000000), 0);
  }, [sheets]);

  const wastePercentage = polygonArea > 0 ? ((sheetsArea - polygonArea) / sheetsArea * 100) : 0;

  const totalProjectStats = useMemo(() => {
      let totalArea = 0;
      let totalSheetsArea = 0;
      let totalSheetsCount = 0;
      
      slopes.forEach(s => {
          const outer = getPolyArea(s.vertices);
          const inner = s.holes.reduce((acc, h) => acc + getPolyArea(h), 0);
          totalArea += Math.max(0, outer - inner);
          
          totalSheetsArea += s.sheets.reduce((acc, sh) => acc + (sh.width * sh.length / 1000000), 0);
          totalSheetsCount += s.sheets.length;
      });
      
      const totalWaste = totalArea > 0 ? ((totalSheetsArea - totalArea) / totalSheetsArea * 100) : 0;
      
      return { totalArea, totalSheetsArea, totalWaste, totalSheetsCount };
  }, [slopes]);

  const getSheetGroups = (sheetList: Sheet[]) => {
    const groups: Record<number, number> = {};
    sheetList.forEach(s => {
        groups[s.label] = (groups[s.label] || 0) + 1;
    });
    return Object.entries(groups).sort((a,b) => Number(b[0]) - Number(a[0]));
  };

  const activeSheetGroups = useMemo(() => getSheetGroups(sheets), [sheets]);

  // --- НОВА ФУНКЦІЯ ЕКСПОРТУ ДЛЯ ANDROID ---
  const handleExportPdf = async () => {
    try {
        const doc = new jsPDF();
        const date = new Date().toLocaleDateString('uk-UA');
        
        doc.setFontSize(18);
        doc.text("Roof Master Pro - Специфікація", 10, 20);
        doc.setFontSize(12);
        doc.text(`Дата: ${date}`, 10, 30);
        doc.text(`Матеріал: ${material.name}`, 10, 40);
        doc.text(`Загальна площа: ${totalProjectStats.totalArea.toFixed(2)} м.кв.`, 10, 50);

        let yPos = 70;
        slopes.forEach((slope, index) => {
            doc.setFontSize(14);
            doc.text(`${index + 1}. ${slope.name}`, 10, yPos);
            yPos += 10;
            
            const groups = getSheetGroups(slope.sheets);
            groups.forEach(([len, count]) => {
                doc.setFontSize(10);
                doc.text(`- Довжина: ${len} мм, Кількість: ${count} шт`, 15, yPos);
                yPos += 7;
                if (yPos > 280) { doc.addPage(); yPos = 20; }
            });
            yPos += 10;
        });

        // Конвертуємо PDF в Base64 для Capacitor
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const fileName = `Roof_Master_${Date.now()}.pdf`;

        // Зберігаємо файл у пам'ять телефону
        const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: pdfBase64,
            directory: Directory.Documents,
        });

        // Відкриваємо файл через системний переглядач
        await FileOpener.open({
            filePath: savedFile.uri,
            contentType: 'application/pdf'
        });

    } catch (error) {
        console.error('Помилка PDF:', error);
        alert('Не вдалося відкрити PDF. Переконайтеся, що у вас встановлено переглядач PDF.');
    }
  };

  const updateTransform = useCallback(() => {
    if (canvasRef.current) {
      const { x, y, scale } = transform.current;
      const s = (isNaN(scale) || scale <= 0) ? 0.05 : scale;
      const tx = isNaN(x) ? 0 : x;
      const ty = isNaN(y) ? 0 : y;
      canvasRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    transform.current.scale = Math.min(10, transform.current.scale * 1.2);
    updateTransform();
    setUiScale(transform.current.scale);
  }, [updateTransform]);

  const handleZoomOut = useCallback(() => {
    transform.current.scale = Math.max(0.001, transform.current.scale / 1.2);
    updateTransform();
    setUiScale(transform.current.scale);
  }, [updateTransform]);

  const fitView = useCallback(() => {
    if (!containerRef.current) return;
    const allPoints = [...vertices, ...holes.flat()].map(toSvg);
    if (allPoints.length === 0) return;

    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));

    const padding = 1000;
    const contentW = (maxX - minX) + padding * 2;
    const contentH = (maxY - minY) + padding * 2;
    
    let containerW = containerRef.current.clientWidth || window.innerWidth;
    let containerH = containerRef.current.clientHeight || window.innerHeight;

    const scale = Math.min(containerW / contentW, containerH / contentH);
    const safeScale = Math.min(Math.max(scale, 0.001), 2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const x = (containerW / 2) - (centerX * safeScale);
    const y = (containerH / 2) - (centerY * safeScale);

    transform.current = { x, y, scale: safeScale };
    updateTransform();
    setUiScale(safeScale);
  }, [vertices, holes, updateTransform]);

  useEffect(() => {
    fitView();
    window.addEventListener('resize', fitView);
    return () => window.removeEventListener('resize', fitView);
  }, [fitView, activeSlopeId]);

  const handlePointerDown = (e: React.PointerEvent, type: 'bg' | 'vertex' | 'hole-move' | 'sheet' | 'guide', id?: any) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    if (type !== 'bg') e.stopPropagation();
    const { x, y } = { x: e.clientX, y: e.clientY };
    lastPos.current = { x, y };
    isDragging.current = true;

    if (type === 'vertex') {
      setActiveElement(id);
      setSelectedVertex(id); 
    } else if (type === 'bg') {
        setActiveElement(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dyScreen = e.clientY - lastPos.current.y; 
    lastPos.current = { x: e.clientX, y: e.clientY };

    if (activeElement !== null) {
      const scale = transform.current.scale || 1;
      const { polyIndex, vertIndex } = activeElement;
      if (polyIndex === -1) {
          setVertices(prev => {
            const next = [...prev];
            next[vertIndex] = { x: next[vertIndex].x + dx / scale, y: next[vertIndex].y - dyScreen / scale };
            return next;
          });
      }
    } else {
      transform.current.x += dx;
      transform.current.y += dyScreen;
      updateTransform();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
  };

  const calculateLayout = useCallback(() => {
    const minX = Math.min(...vertices.map(p => p.x));
    const maxX = Math.max(...vertices.map(p => p.x));
    const minY = Math.min(...vertices.map(p => p.y));
    const maxY = Math.max(...vertices.map(p => p.y));

    const newSheets: Sheet[] = [];
    const stepX = material.effectiveWidth;
    
    for (let x = minX; x < maxX; x += stepX) {
        newSheets.push({
            id: `s-${x}`,
            x: x,
            y: minY,
            width: material.totalWidth,
            length: maxY - minY,
            label: Math.round(maxY - minY),
            fullLength: Math.round(maxY - minY),
            color: COLORS[0],
            row: 0
        });
    }
    setSheets(newSheets);
  }, [vertices, material]);

  useEffect(() => {
      if (step === 'layout') calculateLayout();
  }, [step, activeSlopeId, calculateLayout]);

  const applyTemplate = (points: Point[]) => {
      setVertices(points);
      setShowTemplates(false);
      setTimeout(fitView, 50);
  };

  if (step === 'material') {
    return (
      <div className="w-full h-screen bg-gray-50 flex flex-col p-4">
        <h1 className="text-xl font-bold mb-4">Оберіть матеріал</h1>
        <div className="grid grid-cols-2 gap-4">
            {Object.values(MATERIAL_PRESETS).map(m => (
                <button key={m.type} onClick={() => {setMaterial(m); setStep('geometry');}} className="p-4 bg-white border rounded-xl shadow-sm">
                    {m.name}
                </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden relative">
      <div className="h-14 bg-white shadow-sm flex items-center justify-between px-4 z-50">
          <button onClick={() => setStep('material')} className="p-2 border rounded"><Settings size={20}/></button>
          <span className="font-bold">{material.name}</span>
          <div className="flex gap-2">
            {step === 'geometry' ? (
                <button onClick={() => setStep('layout')} className="bg-blue-600 text-white px-4 py-1 rounded">Розрахувати</button>
            ) : (
                <>
                <button onClick={handleExportPdf} className="bg-green-600 text-white px-4 py-1 rounded flex items-center gap-1">
                    <Download size={16}/> PDF
                </button>
                <button onClick={() => setStep('geometry')} className="p-2 border rounded"><Undo size={16}/></button>
                </>
            )}
          </div>
      </div>

      <main className="flex-1 relative bg-gray-200 touch-none"
            onPointerDown={(e) => handlePointerDown(e, 'bg')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}>
        
        <div className="absolute top-4 left-4 z-40 bg-white/80 p-2 rounded shadow">
            <div className="text-xs">Площа: <b>{polygonArea.toFixed(2)} м²</b></div>
            {step === 'layout' && <div className="text-xs">Листів: <b>{sheets.length} шт</b></div>}
        </div>

        <div ref={canvasRef} className="absolute inset-0 origin-top-left">
            <svg width="10000" height="10000" style={{overflow:'visible'}}>
                <defs><GridBackground /></defs>
                <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />
                
                <path d={`M ${vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`} fill="rgba(37, 99, 235, 0.2)" stroke="#2563EB" strokeWidth="10" />
                
                {step === 'layout' && sheets.map(s => (
                    <rect key={s.id} x={toSvg(s).x} y={toSvg({x:s.x, y:s.y+s.length}).y} width={s.width} height={s.length} fill="rgba(239, 68, 68, 0.1)" stroke="red" strokeWidth="5" />
                ))}

                {step === 'geometry' && vertices.map((p, i) => (
                    <circle key={i} cx={toSvg(p).x} cy={toSvg(p).y} r={50} fill="white" stroke="blue" strokeWidth="10" 
                            onPointerDown={(e) => handlePointerDown(e, 'vertex', {polyIndex:-1, vertIndex:i})} />
                ))}
            </svg>
        </div>
      </main>

      <div className="h-20 bg-white border-t flex items-center justify-around p-2">
          <button onClick={handleZoomIn} className="p-3 bg-gray-100 rounded-full"><Plus/></button>
          <button onClick={fitView} className="p-3 bg-gray-100 rounded-full"><Focus/></button>
          <button onClick={handleZoomOut} className="p-3 bg-gray-100 rounded-full"><Minus/></button>
      </div>
    </div>
  );
}
