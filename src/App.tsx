import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize, LayoutGrid, 
  PlusCircle, Trash2, ArrowRight, Undo, Redo,
  Settings, Calculator,
  MousePointer2, ChevronRight, Focus, Grid3X3, Columns, AlignJustify, MoreHorizontal,
  Ruler, Info, Sparkles, X, Send, MessageSquare, Loader2,
  Square, Scissors, Layers, ChevronDown, ChevronUp, FileText,
  MinusSquare, Move, TrendingUp, TrendingDown, Minus, ArrowUpDown, Crosshair,
  Plus, Download, ArrowUp, ArrowDown, ArrowLeft, LayoutTemplate,
  Copy, Edit2, Check, RotateCcw, RotateCw, AlertTriangle
} from 'lucide-react';

// --- Types ---
type AppStep = 'material' | 'geometry' | 'layout';
type MaterialType = 'tile' | 'profile' | 'siding' | 'picket';
type PicketProfile = 'straight' | 'convex';

interface Point { x: number; y: number; }

interface MaterialParams {
  type: MaterialType;
  name: string;
  totalWidth: number;
  effectiveWidth: number;
  maxLength: number;
  minLength?: number;
  gap?: number;
  overlap?: number;
  picketProfile?: PicketProfile;
  waveStep?: number;
  waveTail?: number;
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
  tile: { type: 'tile', name: 'Металочерепиця', totalWidth: 1180, effectiveWidth: 1100, maxLength: 4000, overlap: 150, waveStep: 350, waveTail: 150 },
  profile: { type: 'profile', name: 'Профнастил', totalWidth: 1160, effectiveWidth: 1100, maxLength: 6000, overlap: 150 },
  siding: { type: 'siding', name: 'Сайдинг', totalWidth: 230, effectiveWidth: 200, maxLength: 3660, overlap: 50 },
  picket: { type: 'picket', name: 'Штахетник', totalWidth: 115, effectiveWidth: 135, maxLength: 2000, minLength: 1700, gap: 20, overlap: 0, picketProfile: 'straight' }
};

const ROOF_TEMPLATES = [
  { id: 'rect', name: 'Прямокутник', points: [{x:0, y:0}, {x:0, y:3000}, {x:4000, y:3000}, {x:4000, y:0}] },
  { id: 'trap', name: 'Трапеція', points: [{x:0,y:0}, {x:1000,y:3000}, {x:4000,y:3000}, {x:5000,y:0}] },
  { id: 'tri', name: 'Трикутник', points: [{x:0,y:0}, {x:2000,y:3500}, {x:4000,y:0}] },
  { id: 'l', name: 'Г-подібний', points: [{x:0,y:0}, {x:0,y:4000}, {x:2000,y:4000}, {x:2000,y:2000}, {x:4000,y:2000}, {x:4000,y:0}] },
  { id: 'u', name: 'П-подібний', points: [{x:0,y:0}, {x:0,y:4000}, {x:1500,y:4000}, {x:1500,y:2000}, {x:3500,y:2000}, {x:3500,y:4000}, {x:5000,y:4000}, {x:5000,y:0}] },
  { id: 't', name: 'Т-подібний', points: [{x:0,y:4000}, {x:1000,y:4000}, {x:1000,y:2500}, {x:3000,y:2500}, {x:3000,y:1500}, {x:1000,y:1500}, {x:1000,y:0}, {x:0,y:0}] },
];

// --- Components ---
const GridBackground = React.memo(() => (
  <>
    <pattern id="smallGrid" width="100" height="100" patternUnits="userSpaceOnUse" x="0" y="0">
      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#94A3B8" strokeWidth="1" strokeOpacity="0.3"/>
    </pattern>
    <pattern id="grid" width="1000" height="1000" patternUnits="userSpaceOnUse" x="0" y="0">
      <rect width="1000" height="1000" fill="url(#smallGrid)"/>
      <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="#64748B" strokeWidth="3" strokeOpacity="0.5"/>
    </pattern>
  </>
));

// --- Gemini API Helper ---
const callGemini = async (prompt: string, context: string) => {
  const apiKey = ""; // System will inject key
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: `System Context: ${context}\n\nUser Query: ${prompt}` }] }] };
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Вибачте, я не зміг обробити запит.";
  } catch (error) { return "Сталася помилка при з'єднанні з AI."; }
};

export default function App() {
  const [step, setStep] = useState<AppStep>('material');
  const [material, setMaterial] = useState<MaterialParams>(MATERIAL_PRESETS.tile);
  
  // --- MULTI-SLOPE STATE (WITH HISTORY) ---
  const initialSlopes: RoofSlope[] = [{
    id: 'slope-1',
    name: 'Схил 1',
    vertices: [{ x: 0, y: 0 }, { x: 2000, y: 3000 }, { x: 4000, y: 3000 }, { x: 6000, y: 0 }],
    holes: [],
    sheets: [],
    layoutOffset: { x: 0, y: 0 }
  }];
  
  const [history, setHistory] = useState({
    list: [initialSlopes],
    index: 0
  });
  
  const slopes = history.list[history.index];

  const setSlopes = useCallback((val: React.SetStateAction<RoofSlope[]>) => {
    setHistory(prev => {
        const current = prev.list[prev.index];
        const next = typeof val === 'function' ? val(current) : val;
        if (current === next) return prev;

        if (isDragging.current) {
            if (!hasPushedDragState.current) {
                hasPushedDragState.current = true;
                let newList = prev.list.slice(0, prev.index + 1);
                newList.push(next);
                if (newList.length > 30) newList = newList.slice(newList.length - 30);
                return { list: newList, index: newList.length - 1 };
            } else {
                const newList = [...prev.list];
                newList[prev.index] = next;
                return { list: newList, index: prev.index };
            }
        }

        let newList = prev.list.slice(0, prev.index + 1);
        newList.push(next);
        if (newList.length > 30) newList = newList.slice(newList.length - 30);
        return { list: newList, index: newList.length - 1 };
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistory(prev => ({ ...prev, index: Math.max(0, prev.index - 1) }));
  }, []);

  const handleRedo = useCallback(() => {
    setHistory(prev => ({ ...prev, index: Math.min(prev.list.length - 1, prev.index + 1) }));
  }, []);

  const [activeSlopeId, setActiveSlopeId] = useState<string>('slope-1');
  const [isRenamingSlope, setIsRenamingSlope] = useState(false);
  const [tempSlopeName, setTempSlopeName] = useState("");

  // Derived Active State Helpers
  const activeSlopeIndex = useMemo(() => slopes.findIndex(s => s.id === activeSlopeId), [slopes, activeSlopeId]);
  const activeSlope = slopes[activeSlopeIndex] || slopes[0]; // fallback

  // Helper to update active slope
  const updateActiveSlope = useCallback((updater: (slope: RoofSlope) => Partial<RoofSlope>) => {
    setSlopes(prev => {
      const newSlopes = [...prev];
      const idx = newSlopes.findIndex(s => s.id === activeSlopeId);
      if (idx !== -1) {
        newSlopes[idx] = { ...newSlopes[idx], ...updater(newSlopes[idx]) };
      }
      return newSlopes;
    });
  }, [activeSlopeId, setSlopes]);

  // Compatibility Wrappers for existing logic
  const vertices = activeSlope.vertices;
  const holes = activeSlope.holes;
  const sheets = activeSlope.sheets;
  const layoutOffset = activeSlope.layoutOffset;

  const setVertices = (val: Point[] | ((p: Point[]) => Point[])) => {
    updateActiveSlope(s => ({ vertices: typeof val === 'function' ? val(s.vertices) : val }));
  };
  const setHoles = (val: Point[][] | ((p: Point[][] ) => Point[][])) => {
    updateActiveSlope(s => ({ holes: typeof val === 'function' ? val(s.holes) : val }));
  };
  const setSheets = (val: Sheet[] | ((p: Sheet[]) => Sheet[])) => {
    updateActiveSlope(s => ({ sheets: typeof val === 'function' ? val(s.sheets) : val }));
  };
  const setLayoutOffset = (val: {x:number, y:number} | ((p: {x:number, y:number}) => {x:number, y:number})) => {
    updateActiveSlope(s => ({ layoutOffset: typeof val === 'function' ? val(s.layoutOffset) : val }));
  };

  // Selection States
  const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [activeElement, setActiveElement] = useState<{ polyIndex: number, vertIndex: number } | null>(null);
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ polyIndex: number, vertIndex: number } | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{ polyIndex: number, vertIndex: number } | null>(null); 
  const [isEditingHeight, setIsEditingHeight] = useState(false);
  const [manualLength, setManualLength] = useState<string>("");
  const [lockedEdgePoint, setLockedEdgePoint] = useState<'p1' | 'p2'>('p1');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  
  // UI States
  const [uiScale, setUiScale] = useState(1);
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false); 
  
  // Picket Specific States
  const [autoGapMode, setAutoGapMode] = useState(false);
  const [picketDensity, setPicketDensity] = useState<number | string>(7); // default 7 pcs / meter

  // AI State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SVGGElement>(null);
  const transform = useRef({ x: 0, y: 0, scale: 0.05 });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasPushedDragState = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const selectedSheets = useMemo(() => sheets.filter(s => selectedSheetIds.includes(s.id)), [sheets, selectedSheetIds]);

  useEffect(() => {
      setSelectedSheetIds([]);
      setIsMultiSelect(false);
  }, [step, activeSlopeId]);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data === 'closePreview') {
        setPreviewHtml(null);
      } else if (e.data && e.data.type === 'PDF_GENERATED') {
        try {
          const base64Str = e.data.data;
          const arr = base64Str.split(',');
          // eslint-disable-next-line
          const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while(n--){ u8arr[n] = bstr.charCodeAt(n); }
          const blob = new Blob([u8arr], {type: mime});
          const file = new File([blob], 'RoofMaster_Spec.pdf', { type: 'application/pdf' });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Специфікація Roof Master'
            });
          } else {
            throw new Error('Share unsupported');
          }
        } catch (err) {
          const a = document.createElement('a');
          a.href = e.data.data; 
          a.download = 'RoofMaster_Spec.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // --- Helpers ---
  const toSvg = (p: Point) => ({ x: p.x, y: -p.y });

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

  // Stats for ACTIVE slope
  const polygonArea = useMemo(() => {
    const outer = getPolyArea(vertices);
    const inner = holes.reduce((acc, h) => acc + getPolyArea(h), 0);
    return Math.max(0, outer - inner);
  }, [vertices, holes]);

  const sheetsArea = useMemo(() => {
      return sheets.reduce((acc, s) => acc + (s.width * s.length / 1000000), 0);
  }, [sheets]);

  const sheetsLinear = useMemo(() => {
      return sheets.reduce((acc, s) => acc + (s.length / 1000), 0);
  }, [sheets]);

  const activeSlopeGap = useMemo(() => {
      if (material.type !== 'picket') return 0;
      if (!autoGapMode) return material.gap || 0;

      const minX = Math.min(...vertices.map(p => p.x));
      const maxX = Math.max(...vertices.map(p => p.x));
      if (isNaN(minX) || isNaN(maxX)) return material.gap || 0;

      const slopeWidth = maxX - minX;
      let count = Math.round((slopeWidth / 1000) * Number(picketDensity));
      if (count < 2) count = 2;

      if (slopeWidth <= material.totalWidth) return 0;

      const activeEffectiveWidth = (slopeWidth - material.totalWidth) / (count - 1);
      return activeEffectiveWidth - material.totalWidth;
  }, [material, autoGapMode, vertices, picketDensity]);

  const getSlopeOverlapArea = useCallback((slopeSheets: Sheet[]) => {
      if (material.type === 'picket') return 0;
      let overlapArea = 0;
      slopeSheets.forEach(sh => {
          if (material.type === 'siding') {
              const overlapW = Math.max(0, material.totalWidth - material.effectiveWidth);
              overlapArea += (sh.width * overlapW) / 1000000;
          } else {
              const parts = sh.id.split('-');
              const colId = parts[1];
              const rowId = parseInt(parts[2], 10);
              const hasSheetAbove = slopeSheets.some(other => {
                  const oParts = other.id.split('-');
                  return oParts[1] === colId && parseInt(oParts[2], 10) === rowId + 1;
              });
              const overlapY = hasSheetAbove ? (material.overlap || 0) : 0;
              const effW = Math.min(sh.width, material.effectiveWidth);
              const effL = Math.max(0, sh.length - overlapY);
              overlapArea += ((sh.width * sh.length) - (effW * effL)) / 1000000;
          }
      });
      return overlapArea;
  }, [material.type, material.totalWidth, material.effectiveWidth, material.overlap]);

  const activeOverlapArea = useMemo(() => getSlopeOverlapArea(sheets), [sheets, getSlopeOverlapArea]);
  const activeUsefulArea = polygonArea + activeOverlapArea;
  const wastePercentage = sheetsArea > 0 ? (Math.max(0, sheetsArea - activeUsefulArea) / sheetsArea * 100) : 0;

  // Global Stats
  const totalProjectStats = useMemo(() => {
      let totalArea = 0;
      let totalSheetsArea = 0;
      let totalSheetsLinear = 0;
      let totalSheetsCount = 0;
      let totalOverlapArea = 0;
      
      slopes.forEach(s => {
          const outer = getPolyArea(s.vertices);
          const inner = s.holes.reduce((acc, h) => acc + getPolyArea(h), 0);
          totalArea += Math.max(0, outer - inner);
          
          totalSheetsArea += s.sheets.reduce((acc, sh) => acc + (sh.width * sh.length / 1000000), 0);
          totalSheetsLinear += s.sheets.reduce((acc, sh) => acc + (sh.length / 1000), 0);
          totalSheetsCount += s.sheets.length;
          totalOverlapArea += getSlopeOverlapArea(s.sheets);
      });
      
      const totalUsefulArea = totalArea + totalOverlapArea;
      const totalWasteArea = Math.max(0, totalSheetsArea - totalUsefulArea);
      const totalWaste = totalSheetsArea > 0 ? (totalWasteArea / totalSheetsArea * 100) : 0;
      
      return { totalArea, totalSheetsArea, totalSheetsLinear, totalWaste, totalSheetsCount, totalUsefulArea };
  }, [slopes, getSlopeOverlapArea]);

  const getSheetGroups = (sheetList: Sheet[]) => {
    const groups: Record<number, number> = {};
    sheetList.forEach(s => {
        groups[s.label] = (groups[s.label] || 0) + 1;
    });
    return Object.entries(groups).sort((a,b) => Number(b[0]) - Number(a[0]));
  };

  const activeSheetGroups = useMemo(() => getSheetGroups(sheets), [sheets]);

  // --- PDF Export Logic ---
  const handleExportPdf = () => {
    const date = new Date().toLocaleDateString('uk-UA');
    const isPicket = material.type === 'picket';
    const isSiding = material.type === 'siding';
    
    // 1. Calculate Global Sheet Groups (Merging identical sizes)
    const globalGroups: Record<number, number> = {};
    slopes.forEach(s => {
        s.sheets.forEach(sh => {
            globalGroups[sh.label] = (globalGroups[sh.label] || 0) + 1;
        });
    });
    const globalSheetList = Object.entries(globalGroups).sort((a,b) => Number(b[0]) - Number(a[0]));

    // 2. Slopes Summary Table HTML
    const slopesSummaryHtml = slopes.map(s => {
        let shapeMinX = Infinity, shapeMaxX = -Infinity, shapeMinY = Infinity, shapeMaxY = -Infinity;
        s.vertices.forEach(p => {
             if (p.x < shapeMinX) shapeMinX = p.x;
             if (p.x > shapeMaxX) shapeMaxX = p.x;
             if (p.y < shapeMinY) shapeMinY = p.y;
             if (p.y > shapeMaxY) shapeMaxY = p.y;
        });
        const shapeW = shapeMaxX === -Infinity ? 0 : shapeMaxX - shapeMinX;
        const shapeH = shapeMaxY === -Infinity ? 0 : shapeMaxY - shapeMinY;
        const sArea = getPolyArea(s.vertices) - s.holes.reduce((acc, h) => acc + getPolyArea(h), 0);

        return `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-weight: bold; color: #1E293B;">${s.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: center; color: #475569;">${(shapeW / 1000).toFixed(2)} × ${(shapeH / 1000).toFixed(2)} м</td>
                <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: bold; color: #0F172A;">${sArea.toFixed(2)} м²</td>
            </tr>
        `;
    }).join('');

    // 3. Global Sheets List HTML
    const globalGroupsHTML = globalSheetList.length === 0 
        ? '<p style="color:#64748B;">Немає листів</p>' 
        : globalSheetList.map(([len, count], i) => `
        <div class="avoid-break" style="display: flex; background: #F1F5F9; margin-bottom: 8px; padding: 12px 15px; border: 1px solid #E2E8F0; border-radius: 6px; align-items: center;">
            <div style="width: 45px; font-weight: bold; color: #64748B; font-size: 14px;"># ${i + 1}</div>
            <div style="flex: 1; font-size: 16px; color: #334155;">
                Розмір: <strong style="font-size: 18px; color: #0F172A;">${isPicket ? Math.round(Number(len)/10) + ' см' : len + ' мм'}</strong>
            </div>
            <div style="width: 140px; text-align: right; font-size: 15px; color: #475569;">
                Кількість: <strong style="color: #2563EB; font-size: 18px;">${count} шт</strong>
            </div>
        </div>
    `).join('');

    // 4. Global Stats HTML
    const globalStatsHtml = `
        <ul class="avoid-break" style="list-style: none; padding: 0; margin: 0 0 30px 0; font-size: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px;">
            <li style="padding: 8px 0; border-bottom: 1px dashed #CBD5E1; display: flex; justify-content: space-between;">
                <span style="color: #475569;">Площа покрівлі (чиста):</span>
                <strong style="font-size: 18px;">${totalProjectStats.totalArea.toFixed(2)} м²</strong>
            </li>
            <li style="padding: 8px 0; border-bottom: 1px dashed #CBD5E1; display: flex; justify-content: space-between;">
                <span style="color: #475569;">${isPicket ? 'Загальна кількість м.п.:' : 'Загальна площа листів:'}</span>
                <strong style="font-size: 18px;">${isPicket ? totalProjectStats.totalSheetsLinear.toFixed(2) + ' м.п.' : totalProjectStats.totalSheetsArea.toFixed(2) + ' м²'}</strong>
            </li>
            ${material.type !== 'picket' ? `
            <li style="padding: 8px 0; border-bottom: 1px dashed #CBD5E1; display: flex; justify-content: space-between;">
                <span style="color: #475569;">Відходи:</span>
                <strong style="color: #DC2626; font-size: 18px;">${totalProjectStats.totalWaste.toFixed(2)} %</strong>
            </li>` : ''}
            <li style="padding: 8px 0; display: flex; justify-content: space-between;">
                <span style="color: #475569;">Загальна кількість листів:</span>
                <strong style="color: #2563EB; font-size: 18px;">${totalProjectStats.totalSheetsCount} шт</strong>
            </li>
        </ul>
    `;

    // 5. SVG Generator for Slopes
    const generateSlopeSvg = (slope: RoofSlope) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        [...slope.vertices, ...slope.holes.flat()].map(toSvg).forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        slope.sheets.forEach(sheet => {
            const tl = toSvg({ x: sheet.x, y: sheet.y + sheet.length });
            const br = toSvg({ x: sheet.x + sheet.width, y: sheet.y });

            if (tl.x < minX) minX = tl.x;
            if (tl.x > maxX) maxX = tl.x;
            if (tl.y < minY) minY = tl.y;
            if (tl.y > maxY) maxY = tl.y;

            if (br.x < minX) minX = br.x;
            if (br.x > maxX) maxX = br.x;
            if (br.y < minY) minY = br.y;
            if (br.y > maxY) maxY = br.y;
        });

        if (minX === Infinity) return "";
        
        let width = maxX - minX;
        let height = maxY - minY;
        if (width === 0) width = 1000;
        if (height === 0) height = 1000;

        // Зменшені відступи, оскільки немає виносних ліній розмірів
        const pX = Math.max(width * 0.05, 50); 
        const pY = Math.max(height * 0.05, 50);
        
        const vbWidth = width + pX * 2;
        const vbHeight = height + pY * 2;
        const viewBox = `${minX - pX} ${minY - pY} ${vbWidth} ${vbHeight}`;
        
        const aspect = vbWidth / vbHeight;
        let renderH = 450; 
        let renderW = renderH * aspect;

        if (renderW > 680) {
            renderW = 680;
            renderH = renderW / aspect;
        }

        const defs = `
            <defs>
                <pattern id="smallGrid_pdf_${slope.id}" width="100" height="100" patternUnits="userSpaceOnUse" x="0" y="0">
                    <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-opacity="0.3"/>
                </pattern>
                <pattern id="grid_pdf_${slope.id}" width="1000" height="1000" patternUnits="userSpaceOnUse" x="0" y="0">
                    <rect width="1000" height="1000" fill="url(#smallGrid_pdf_${slope.id})"/>
                    <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="#94A3B8" stroke-width="6" stroke-opacity="0.5"/>
                </pattern>
            </defs>
        `;

        const gridRect = `<rect x="${minX - pX}" y="${minY - pY}" width="${vbWidth}" height="${vbHeight}" fill="url(#grid_pdf_${slope.id})" />`;
        const bgPath = `M ${slope.vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z ${slope.holes.map(h => `M ${h.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`).join(' ')}`;
        
        const sheetsSvg = slope.sheets.map(sheet => {
            const pos = toSvg({x: sheet.x, y: sheet.y + sheet.length});
            const strokeW = isSiding ? 2 : 5;
            
            const cx = sheet.width / 2;
            const cy = sheet.length / 2;
            const rotate = !isSiding ? -90 : 0;
            
            let fontSize = 150;
            if (isSiding) {
                fontSize = sheet.length * 0.4;
            } else if (isPicket) {
                fontSize = Math.min(sheet.length * 0.4, 140);
            } else {
                fontSize = Math.min(sheet.length * 0.3, sheet.width * 0.25);
                if (fontSize < 150) fontSize = 150;
            }
            const labelText = sheet.label.toString();

            return `
                <g transform="translate(${pos.x}, ${pos.y})">
                    <rect width="${sheet.width}" height="${sheet.length}" fill="${sheet.color}" fill-opacity="0.15" stroke="#EF4444" stroke-width="${strokeW}" stroke-dasharray="20,10" />
                    
                    <g transform="translate(${cx}, ${cy}) rotate(${rotate})">
                         <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="none" stroke="white" stroke-width="${fontSize * 0.1}" font-size="${fontSize}" font-weight="bold" font-family="sans-serif">${labelText}</text>
                         <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="#991B1B" font-size="${fontSize}" font-weight="bold" font-family="sans-serif">${labelText}</text>
                    </g>
                </g>
            `;
        }).join('');
        
        const outlinePath = `M ${slope.vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`;
        const holesSvg = slope.holes.map(h => `
             <path d="M ${h.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z" fill="rgba(239, 68, 68, 0.1)" stroke="#EF4444" stroke-opacity="0.5" stroke-width="10" stroke-dasharray="15,15" />
        `).join('');

        return `<svg viewBox="${viewBox}" width="${renderW}" height="${renderH}" style="max-width: 100%; height: auto; display: block; margin: 0 auto; overflow: visible;" preserveAspectRatio="xMidYMid meet">
            ${defs}
            ${gridRect}
            <path d="${bgPath}" fill="#F1F5F9" stroke="none" fill-rule="evenodd" opacity="0.8" />
            ${sheetsSvg}
            <path d="${outlinePath}" fill="none" stroke="#2563EB" stroke-opacity="0.8" stroke-width="8" />
            ${holesSvg}
        </svg>`;
    };

    // 6. Slope Sections Generation (Pages 2+)
    let slopeSections = slopes.map((s) => {
        const svg = generateSlopeSvg(s);
        
        return `
        <div class="slope-section page-break-before" style="padding-top: 20px;">
            <div class="section-title avoid-break" style="font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #1F2937; border-bottom: 2px solid #2563EB; padding-bottom: 8px;">
                Схил: ${s.name}
            </div>
            <div class="svg-container avoid-break" style="border: 2px dashed #CBD5E1; border-radius: 8px; padding: 15px; background: white; margin-bottom: 25px; text-align: center; box-sizing: border-box; overflow: hidden; min-height: 500px; display: flex; align-items: center; justify-content: center;">
                ${svg}
            </div>
        </div>`;
    }).join('');

    // 7. HTML Content Assembly
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Специфікація - ${material.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; background: #F1F5F9; margin: 0; color: #1f2937; }
          
          #pdf-content { width: 100% !important; max-width: 800px !important; margin: 0 auto; background: #fff; padding: 20px; box-sizing: border-box; }
          
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1E3A8A; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { margin: 0; color: #111827; font-size: 28px; }
          .sub-title { color: #6B7280; margin: 5px 0 0 0; font-size: 16px; }
          .meta-box { text-align: right; font-size: 15px; color: #4B5563; }
          
          .page-break-before { page-break-before: always; break-before: page; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          
          @media print {
            body { background: #fff; padding: 0; margin: 0; }
            #pdf-content { box-shadow: none; border-radius: 0; padding: 20px; margin: 0; }
            .no-print { display: none !important; }
          }
          .print-controls {
            position: fixed; bottom: 20px; right: 20px; display: flex; gap: 10px; z-index: 50;
          }
          .btn {
            background: #2563EB; color: white; border: none; padding: 12px 20px; 
            border-radius: 50px; font-weight: bold; cursor: pointer; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 8px;
            font-size: 14px; transition: transform 0.1s;
          }
          .btn:active { transform: scale(0.95); }
          .btn-close { background: #DC2626; }
        </style>
      </head>
      <body>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        
        <div class="print-controls no-print">
            <button class="btn btn-close" onclick="window.parent.postMessage('closePreview', '*');">✕ Закрити</button>
            <button class="btn" style="background: #059669;" onclick="window.print()">🖨️ Друк</button>
            <button class="btn" onclick="sharePDF()" id="pdfBtn">💾 Зберегти PDF</button>
        </div>
        
        <script>
        function sharePDF() {
            window.scrollTo(0, 0); 
            var btn = document.getElementById('pdfBtn');
            var originalText = btn.innerHTML;
            btn.innerHTML = '⏳ Формування...';
            var controls = document.querySelector('.print-controls');
            controls.style.display = 'none';
            
            var element = document.getElementById('pdf-content');
            
            var opt = {
                margin: [15, 10, 15, 10],
                filename: 'RoofMaster_Spec.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                pagebreak: { mode: ['css', 'legacy'] },
                html2canvas: { 
                    scale: 2, 
                    useCORS: true, 
                    logging: false, 
                    scrollY: 0, 
                    scrollX: 0,
                    windowWidth: document.documentElement.scrollWidth
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            html2pdf().set(opt).from(element).output('datauristring').then(function(pdfBase64) {
                controls.style.display = 'flex';
                btn.innerHTML = originalText;
                window.parent.postMessage({ type: 'PDF_GENERATED', data: pdfBase64 }, '*');
            }).catch(function(e) {
                controls.style.display = 'flex';
                btn.innerHTML = originalText;
                alert('Помилка генерації: ' + e);
            });
        }
        </script>

        <div style="width: 100%; overflow: visible;">
          <div id="pdf-content">
              
              <!-- Зведена сторінка (Сторінка 1) -->
              <div class="summary-page">
                  <div class="header avoid-break">
                    <div>
                      <h1>Детальна Специфікація</h1>
                      <p class="sub-title">Згенеровано Roof Master</p>
                    </div>
                    <div class="meta-box">
                      <div><strong>Дата:</strong> ${date}</div>
                      <div><strong>Матеріал:</strong> ${material.name}</div>
                      <div style="font-size: 13px; color: #9CA3AF; margin-top:4px;">
                        ${isPicket
                            ? `Ширина штахети: ${material.totalWidth} мм${autoGapMode ? ' (Зазор авто)' : ` / Зазор: ${material.gap} мм`}`
                            : `Габарити: ${material.totalWidth} мм / ${material.effectiveWidth} мм`}
                      </div>
                    </div>
                  </div>

                  <div class="section-title avoid-break" style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #1F2937; border-bottom: 2px solid #2563EB; padding-bottom: 8px;">Загальні показники проекту</div>
                  ${globalStatsHtml}

                  <div class="section-title avoid-break" style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #1F2937; border-bottom: 2px solid #2563EB; padding-bottom: 8px;">Перелік схилів</div>
                  <table class="avoid-break" style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 15px; background: white; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                      <thead>
                          <tr style="background: #F8FAFC; color: #475569;">
                              <th style="padding: 12px 15px; border-bottom: 2px solid #CBD5E1; text-align: left;">Назва схилу</th>
                              <th style="padding: 12px 15px; border-bottom: 2px solid #CBD5E1; text-align: center;">Габарити (Ш×В)</th>
                              <th style="padding: 12px 15px; border-bottom: 2px solid #CBD5E1; text-align: right;">Площа</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${slopesSummaryHtml}
                      </tbody>
                  </table>

                  <div class="section-title avoid-break" style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #1F2937; border-bottom: 2px solid #2563EB; padding-bottom: 8px;">
                      Специфікація листів (Зведена)
                  </div>
                  <div class="vertical-sheets">
                      ${globalGroupsHTML}
                  </div>
              </div>

              <!-- Креслення окремих схилів (Наступні сторінки) -->
              ${slopeSections}
              
          </div>
        </div>

      </body>
      </html>
    `;

    setPreviewHtml(htmlContent);
  };

  // --- AI Logic ---
  const getProjectContext = () => {
    return `
      Ти експерт-покрівельник у додатку Roof Master.
      Поточний проект (Схилів: ${slopes.length}):
      - Матеріал: ${material.name}
      - Загальна площа: ${totalProjectStats.totalArea.toFixed(2)} м² ${material.type === 'picket' ? `(Загальна довжина: ${totalProjectStats.totalSheetsLinear.toFixed(2)} м.п.)` : ''}
      - Активний схил: ${activeSlope.name} (${polygonArea.toFixed(2)} м²)
    `;
  };

  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiInput("");
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiLoading(true);
    const response = await callGemini(userMsg, getProjectContext());
    setAiMessages(prev => [...prev, { role: 'model', text: response }]);
    setAiLoading(false);
  };

  const startAiAnalysis = async () => {
    setShowAiModal(true);
    if (aiMessages.length === 0) {
        setAiLoading(true);
        const response = await callGemini("Зроби аналіз проекту.", getProjectContext());
        setAiMessages([{ role: 'model', text: response }]);
        setAiLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);


  // --- Rendering & Viewport ---
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

    if (isNaN(minX) || isNaN(maxX)) return;

    const padding = window.innerWidth < 600 ? 500 : 1000;
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
    const timer = setTimeout(fitView, 500);
    return () => {
      window.removeEventListener('resize', fitView);
      clearTimeout(timer);
    };
  }, [fitView, activeSlopeId]);

  useEffect(() => {
    if (step !== 'material') {
      setTimeout(fitView, 100);
      setTimeout(fitView, 500);
    }
  }, [step, fitView]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // --- INTERACTION ENGINE V2: POINTER EVENTS ---
  const getPointerPos = (e: React.PointerEvent) => {
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e: React.PointerEvent, type: 'bg' | 'vertex' | 'hole-move' | 'sheet', id?: any) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    
    if (type !== 'bg') e.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    hasPushedDragState.current = false;

    lastPos.current = getPointerPos(e);
    isDragging.current = true;

    if (type === 'vertex') {
      setActiveElement(id);
      setSelectedVertex(id); 
      setSelectedEdge(null);
      setIsEditingHeight(false); 
      if (id.polyIndex >= 0) setSelectedHoleIndex(id.polyIndex);
      else setSelectedHoleIndex(null);
    } else if (type === 'hole-move') {
      setActiveElement({ polyIndex: id, vertIndex: -1 }); 
      setSelectedHoleIndex(id);
      setSelectedEdge(null);
      setIsEditingHeight(false);
      setSelectedVertex(null);
    } else if (type === 'sheet') {
      if (e.shiftKey || e.ctrlKey || e.metaKey || isMultiSelect) {
          setSelectedSheetIds(prev => prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]);
      } else {
          setSelectedSheetIds([id]);
      }
      isDragging.current = false; 
    } else {
      setActiveElement(null);
      setSelectedSheetIds([]);
      setSelectedEdge(null);
      setSelectedHoleIndex(null);
      setIsEditingHeight(false);
      setSelectedVertex(null); 
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    if (e.clientX === 0 && e.clientY === 0 && e.movementX === 0 && e.movementY === 0) return;

    const { x, y } = getPointerPos(e);
    const dx = x - lastPos.current.x;
    const dyScreen = y - lastPos.current.y; 
    const dy = -dyScreen; 
    lastPos.current = { x, y };

    if (activeElement !== null) {
      const scale = transform.current.scale || 1;
      const { polyIndex, vertIndex } = activeElement;
      if (Math.abs(dx) > 200 || Math.abs(dy) > 200) return;

      if (polyIndex === -1) {
          setVertices(prev => {
            const next = [...prev];
            if (next[vertIndex]) {
                next[vertIndex] = { x: Math.max(0, next[vertIndex].x + dx / scale), y: Math.max(0, next[vertIndex].y + dy / scale) };
            }
            return next;
          });
      } else {
          setHoles(prev => {
              const nextHoles = [...prev];
              let nextPoly = [...nextHoles[polyIndex]];
              if (vertIndex === -1) {
                  const minX = Math.min(...nextPoly.map(p => p.x + dx / scale));
                  const minY = Math.min(...nextPoly.map(p => p.y + dy / scale));
                  let adjDx = dx / scale;
                  let adjDy = dy / scale;
                  if (minX < 0) adjDx -= minX; 
                  if (minY < 0) adjDy -= minY;
                  
                  nextPoly = nextPoly.map(p => ({ x: p.x + adjDx, y: p.y + adjDy }));
              } else {
                  if (nextPoly[vertIndex]) {
                      nextPoly[vertIndex] = { x: Math.max(0, nextPoly[vertIndex].x + dx / scale), y: Math.max(0, nextPoly[vertIndex].y + dy / scale) };
                  }
              }
              nextHoles[polyIndex] = nextPoly;
              return nextHoles;
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
    (e.target as Element).releasePointerCapture(e.pointerId);
    setUiScale(transform.current.scale);
  };

  const updateVertexCoordinate = (axis: 'x' | 'y', val: number) => {
      if (!selectedVertex) return;
      const clampedVal = Math.max(0, val);
      const { polyIndex, vertIndex } = selectedVertex;
      if (polyIndex === -1) {
          setVertices(prev => {
              const next = [...prev];
              next[vertIndex] = { ...next[vertIndex], [axis]: clampedVal };
              return next;
          });
      } else {
          setHoles(prev => {
              const next = [...prev];
              const poly = [...next[polyIndex]];
              poly[vertIndex] = { ...poly[vertIndex], [axis]: clampedVal };
              next[polyIndex] = poly;
              return next;
          });
      }
  };

  // --- Logic Functions ---
  const moveLayout = (dx: number, dy: number) => {
    setLayoutOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const resizeSelectedSheets = useCallback((dy: number) => {
      setSheets(prev => prev.map(sheet => {
          if (selectedSheetIds.includes(sheet.id)) {
              if (material.type === 'siding') {
                  const newWidth = Math.max(10, sheet.width + dy);
                  return { ...sheet, width: newWidth, label: newWidth, fullLength: newWidth };
              } else {
                  const newLength = Math.max(10, sheet.length + dy);
                  return { ...sheet, length: newLength, label: newLength, fullLength: newLength };
              }
          }
          return sheet;
      }));
  }, [selectedSheetIds, material.type]);

  const updateEdgeLength = (newLength: number, lockedPoint: 'p1' | 'p2') => {
    if (selectedEdge === null) return;
    const { polyIndex, vertIndex } = selectedEdge;
    
    const applyChange = (points: Point[]) => {
        const i1 = vertIndex;
        const i2 = (vertIndex + 1) % points.length;
        const p1 = points[i1];
        const p2 = points[i2];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        
        const currentLen = Math.hypot(dx, dy);
        if (currentLen === 0) return points;
        const ratio = newLength / currentLen;
        const newPoints = [...points];

        if (lockedPoint === 'p1') {
            newPoints[i2] = { x: p1.x + dx * ratio, y: p1.y + dy * ratio };
        } else {
            newPoints[i1] = { x: p2.x - dx * ratio, y: p2.y - dy * ratio };
        }
        return newPoints;
    };

    updateActiveSlope(s => {
        let newVertices = [...s.vertices];
        let newHoles = s.holes.map(h => [...h]);

        if (polyIndex === -1) {
            newVertices = applyChange(newVertices);
        } else {
            newHoles[polyIndex] = applyChange(newHoles[polyIndex]);
        }

        // Global normalization to prevent negative coordinates after edge resizing
        const allPoints = [...newVertices, ...newHoles.flat()];
        const minX = Math.min(...allPoints.map(p => p.x));
        const minY = Math.min(...allPoints.map(p => p.y));

        let shiftX = 0, shiftY = 0;
        if (minX < 0) shiftX = -minX;
        if (minY < 0) shiftY = -minY;

        if (shiftX > 0 || shiftY > 0) {
            newVertices = newVertices.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }));
            newHoles = newHoles.map(h => h.map(p => ({ x: p.x + shiftX, y: p.y + shiftY })));
        }

        return { vertices: newVertices, holes: newHoles };
    });
  };

  const updateHeight = (newH: number) => {
    const ys = vertices.map(p => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const currentH = maxY - minY;
    if (currentH < 1 || newH < 1) return;
    const scale = newH / currentH;
    setVertices(prev => prev.map(p => ({ ...p, y: Math.max(0, minY + (p.y - minY) * scale) })));
  };

  const getIntersections = (scanLineVal: number, isVertical: boolean) => {
    const intersections: number[] = [];
    const allPolys = [vertices, ...holes];
    allPolys.forEach(poly => {
        for (let j = 0; j < poly.length; j++) {
            const p1 = poly[j];
            const p2 = poly[(j + 1) % poly.length];
            if (isVertical) {
                 if ((p1.x <= scanLineVal && p2.x > scanLineVal) || (p2.x <= scanLineVal && p1.x > scanLineVal)) {
                    const t = (scanLineVal - p1.x) / (p2.x - p1.x);
                    const y = p1.y + t * (p2.y - p1.y);
                    intersections.push(y);
                 }
            } else {
                 if ((p1.y <= scanLineVal && p2.y > scanLineVal) || (p2.y <= scanLineVal && p1.y > scanLineVal)) {
                    const t = (scanLineVal - p1.y) / (p2.y - p1.y);
                    const x = p1.x + t * (p2.x - p1.x);
                    intersections.push(x);
                 }
            }
        }
    });
    return intersections.sort((a, b) => a - b);
  };

  const getMergedSegments = (minVal: number, maxVal: number, isVertical: boolean) => {
      let scanLines = [minVal + 1, maxVal - 1, (minVal + maxVal) / 2];
      
      const allPolys = [vertices, ...holes];
      allPolys.forEach(poly => {
          poly.forEach(p => {
              const val = isVertical ? p.x : p.y;
              if (val >= minVal && val <= maxVal) {
                  scanLines.push(val);
              }
          });
      });

      scanLines = [...new Set(scanLines)].sort((a, b) => a - b);

      let segments: [number, number][] = [];
      scanLines.forEach(probe => {
          const ints = getIntersections(probe, isVertical);
          for (let k = 0; k < ints.length; k += 2) {
              if (k + 1 < ints.length) segments.push([ints[k], ints[k+1]]);
          }
      });

      if (segments.length === 0) return [];
      segments.sort((a, b) => a[0] - b[0]);
      
      const merged: [number, number][] = [];
      let current = segments[0];
      for (let i = 1; i < segments.length; i++) {
          const next = segments[i];
          if (next[0] <= current[1]) {
              current[1] = Math.max(current[1], next[1]);
          } else { 
              merged.push(current); 
              current = next; 
          }
      }
      merged.push(current);
      return merged;
  };

  const calculateLayout = useCallback(() => {
    const minX = Math.min(...vertices.map(p => p.x));
    const maxX = Math.max(...vertices.map(p => p.x));
    const minY = Math.min(...vertices.map(p => p.y));
    const maxY = Math.max(...vertices.map(p => p.y));

    const newSheets: Sheet[] = [];
    const maxLength = material.maxLength || 6000;
    const overlap = material.overlap || 0;
    const isTile = material.type === 'tile';
    
    const waveStep = material.waveStep || 350;
    const waveTail = material.waveTail || 150;
    
    const fixTileLength = (len: number) => {
        let fixed = Math.ceil(len / 50) * 50;
        const minLen = waveStep + waveTail; 
        if (fixed < minLen) fixed = minLen;
        
        let localPos = (fixed - waveTail) % waveStep;
        if (localPos < 0) localPos += waveStep; 
        
        if (localPos > 200) {
            fixed += (waveStep - localPos); 
        }
        
        return fixed;
    };

    let stepY = maxLength - overlap;
    let maxValidLength = maxLength;
    
    if (isTile) {
        const waveCount = Math.floor((maxLength - waveTail) / waveStep);
        maxValidLength = waveCount > 0 ? waveCount * waveStep + waveTail : waveStep + waveTail;
        stepY = maxValidLength - overlap;
    }

    if (material.type === 'siding') {
        const gridOriginY = maxY + layoutOffset.y; 
        const startRow = Math.floor((gridOriginY - maxY) / material.effectiveWidth) - 1;
        const endRow = Math.ceil((gridOriginY - minY) / material.effectiveWidth) + 1;

        for (let i = startRow; i <= endRow; i++) {
             const stripBottom = gridOriginY - i * material.effectiveWidth;
             const stripTop = stripBottom - material.totalWidth;
             
             if (stripBottom <= minY + 1) continue; 
             if (stripTop >= maxY - 1) continue;

             const segments = getMergedSegments(stripTop, stripBottom, false);
             const panelOriginX = minX + layoutOffset.x;
             const stepX = maxLength - overlap;

             segments.forEach(([xMin, xMax]) => {
                 const startM = Math.floor((xMin - panelOriginX) / stepX);
                 const count = Math.ceil((xMax - xMin) / stepX) + 2;

                 for (let offset = 0; offset < count; offset++) {
                     const m = startM + offset;
                     const theoLeft = panelOriginX + m * stepX;
                     const theoRight = theoLeft + maxLength;
                     const visibleLeft = Math.max(theoLeft, xMin);
                     const visibleRight = Math.min(theoRight, xMax);
                     const visibleWidth = visibleRight - visibleLeft;

                     if (visibleWidth <= 1) continue;
                     
                     newSheets.push({
                         id: `s-${i}-${m}`,
                         x: visibleLeft,
                         y: stripTop,
                         width: Math.round(visibleWidth), 
                         length: material.totalWidth, 
                         label: Math.round(visibleWidth), 
                         fullLength: Math.round(visibleWidth),
                         color: COLORS[Math.abs(i) % COLORS.length],
                         row: i
                     });
                 }
             });
        }
    } else {
        const slopeWidth = maxX - minX;
        let gridOriginX = minX + layoutOffset.x;
        let activeEffectiveWidth = material.effectiveWidth;

        let actualStartK = 0;
        let actualEndK = 0;

        if (material.type === 'picket') {
            if (autoGapMode) {
                let count = Math.round((slopeWidth / 1000) * Number(picketDensity));
                if (count < 2) count = 2;
                
                if (slopeWidth <= material.totalWidth) {
                    activeEffectiveWidth = material.totalWidth;
                    actualStartK = 0;
                    actualEndK = 0;
                } else {
                    activeEffectiveWidth = (slopeWidth - material.totalWidth) / (count - 1);
                    actualStartK = 0;
                    actualEndK = count - 1;
                }
                gridOriginX = minX;
            } else {
                let startK = Math.floor((minX - gridOriginX) / activeEffectiveWidth);
                let endK = Math.floor((maxX - gridOriginX) / activeEffectiveWidth) + 1;
                
                actualStartK = startK;
                while (actualStartK <= endK) {
                    if (gridOriginX + actualStartK * activeEffectiveWidth >= minX - 0.1) break;
                    actualStartK++;
                }
                actualEndK = endK;
                while (actualEndK >= startK) {
                    if (gridOriginX + actualEndK * activeEffectiveWidth <= maxX + 0.1) break;
                    actualEndK--;
                }
            }
        } else {
            actualStartK = Math.floor((minX - gridOriginX) / activeEffectiveWidth);
            actualEndK = Math.ceil((maxX - gridOriginX) / activeEffectiveWidth) - 1;
        }

        const totalPickets = Math.max(1, actualEndK - actualStartK + 1);
        const realFenceWidth = Math.max(0, (totalPickets - 1) * activeEffectiveWidth); 
        const realStartX = gridOriginX + actualStartK * activeEffectiveWidth;
        const realCenterX = realStartX + realFenceWidth / 2 + material.totalWidth / 2;

        for (let i = actualStartK; i <= actualEndK; i++) {
           const stripLeft = gridOriginX + i * activeEffectiveWidth;
           const stripRight = stripLeft + material.totalWidth;
           const stripCenter = stripLeft + material.totalWidth / 2;
           
           if (material.type === 'picket') {
               if (i < actualStartK || i > actualEndK) continue;
           } else {
               if (stripLeft >= maxX - 1) continue;
               if (stripRight <= minX + 1) continue;
           }

           const segments = getMergedSegments(stripLeft, stripRight, true);

           segments.forEach(([yMin, yMax]) => {
                const totalLen = yMax - yMin;
                if (totalLen <= 0) return;

                let currentY = yMin; 
                let sheetIndex = 0;

                while (currentY < yMax) {
                    let orderedLen = maxLength; 
                    
                    if (isTile) {
                         if (currentY + maxValidLength < yMax) {
                             orderedLen = maxValidLength;
                         } else {
                             let neededLen = yMax - currentY;
                             orderedLen = fixTileLength(neededLen);
                         }
                    } else if (material.type === 'picket') {
                        const availableHeight = totalLen;
                        let peakHeight = Math.min(material.maxLength, availableHeight);
                        let picketH = peakHeight; 

                        if (material.picketProfile && material.picketProfile !== 'straight') {
                            const dist = Math.abs(stripCenter - realCenterX); 
                            const W = Math.max(1, (totalPickets - 1) * activeEffectiveWidth); 
                            const H = Math.max(0, material.maxLength - (material.minLength || material.maxLength));
                            
                            if (H > 0 && W > 0) {
                                const R = (H / 2) + ((W * W) / (8 * H));
                                const safeDist = Math.min(dist, R); 
                                const arcOffset = Math.sqrt(R * R - safeDist * safeDist) - (R - H);
                                
                                if (material.picketProfile === 'convex') {
                                    picketH = (peakHeight - H) + arcOffset;
                                }
                            }
                        }

                        picketH = Math.round(picketH / 10) * 10;
                        if (picketH > availableHeight) picketH = Math.floor(availableHeight / 10) * 10;
                        if (picketH < 0) picketH = 0;

                        orderedLen = picketH;
                    } else {
                        if (currentY + maxLength < yMax) {
                            orderedLen = maxLength;
                        } else {
                            orderedLen = yMax - currentY;
                        }
                    }

                    if (orderedLen > 10) {
                        let displayY = currentY;
                        if (material.type === 'picket') {
                             displayY = yMin;
                        }

                         newSheets.push({
                            id: `s-${i}-${sheetIndex}-${currentY.toFixed(0)}`,
                            x: stripLeft,
                            y: displayY,
                            width: material.totalWidth,
                            length: Math.round(orderedLen),
                            label: Math.round(orderedLen),
                            fullLength: Math.round(orderedLen),
                            color: COLORS[Math.abs(sheetIndex) % COLORS.length],
                            row: sheetIndex
                        });
                    }

                    if (isTile) {
                        currentY += stepY;
                    } else if (material.type === 'picket') {
                        currentY += 999999; 
                    } else {
                        currentY += (maxLength - overlap);
                    }
                    sheetIndex++;
                }
           });
        }
    }
    setSheets(newSheets);
  }, [vertices, holes, material, layoutOffset, autoGapMode, picketDensity]);

  useEffect(() => {
      if (step === 'layout') {
          calculateLayout();
      }
  }, [calculateLayout, step, activeSlopeId]); 

  // --- Пересування листів стрілками (Клавіатура) ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName || '')) return;

          if (step === 'layout' && selectedSheetIds.length > 0) {
              if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.preventDefault(); 
                  const moveStep = e.shiftKey ? 50 : 10; 
                  let dx = 0;
                  let dy = 0;

                  if (e.key === 'ArrowUp') dy = moveStep;
                  if (e.key === 'ArrowDown') dy = -moveStep;
                  if (e.key === 'ArrowLeft') dx = -moveStep;
                  if (e.key === 'ArrowRight') dx = moveStep;

                  setSheets(prev => prev.map(sheet => {
                      if (selectedSheetIds.includes(sheet.id)) {
                          let newSheet = { ...sheet };
                          if (dx !== 0) {
                              newSheet.x += dx;
                          }
                          if (dy !== 0) {
                              if (material.type === 'siding') {
                                  newSheet.width = Math.max(10, newSheet.width + dy);
                                  newSheet.label = newSheet.width;
                                  newSheet.fullLength = newSheet.width;
                              } else {
                                  newSheet.length = Math.max(10, newSheet.length + dy);
                                  newSheet.label = newSheet.length;
                                  newSheet.fullLength = newSheet.length;
                              }
                          }
                          return newSheet;
                      }
                      return sheet;
                  }));
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, selectedSheetIds, setSheets, material.type]);

  const rotateShape = (direction: 'cw' | 'ccw') => {
      const allPoints = [...vertices, ...holes.flat()];
      if (allPoints.length === 0) return;

      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = Math.min(...allPoints.map(p => p.y));
      const maxY = Math.max(...allPoints.map(p => p.y));
      
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const rotatePoint = (p: Point) => {
          const px = p.x - cx;
          const py = p.y - cy;
          if (direction === 'cw') {
              return { x: cx + py, y: cy - px };
          } else {
              return { x: cx - py, y: cy + px };
          }
      };

      updateActiveSlope(s => {
          let newVertices = s.vertices.map(rotatePoint);
          let newHoles = s.holes.map(hole => hole.map(rotatePoint));
          
          // Global normalization to prevent negative coordinates after rotation
          const rotatedPoints = [...newVertices, ...newHoles.flat()];
          const rMinX = Math.min(...rotatedPoints.map(p => p.x));
          const rMinY = Math.min(...rotatedPoints.map(p => p.y));
          
          let shiftX = 0, shiftY = 0;
          if (rMinX < 0) shiftX = -rMinX;
          if (rMinY < 0) shiftY = -rMinY;

          if (shiftX > 0 || shiftY > 0) {
              newVertices = newVertices.map(p => ({ x: p.x + shiftX, y: p.y + shiftY }));
              newHoles = newHoles.map(h => h.map(p => ({ x: p.x + shiftX, y: p.y + shiftY })));
          }

          return { vertices: newVertices, holes: newHoles };
      });
      
      setTimeout(fitView, 50);
  };

  const applyTemplate = (points: Point[]) => {
      setVertices(points);
      setHoles([]);
      setShowTemplates(false);
      setTimeout(fitView, 50);
  };

  // --- SLOPE MANAGEMENT ---
  const addSlope = () => {
      const newId = `slope-${Date.now()}`;
      setSlopes(prev => [...prev, {
          id: newId,
          name: `Схил ${prev.length + 1}`,
          vertices: [{ x: 0, y: 0 }, { x: 0, y: 3000 }, { x: 4000, y: 3000 }, { x: 4000, y: 0 }],
          holes: [],
          sheets: [],
          layoutOffset: { x: 0, y: 0 }
      }]);
      setActiveSlopeId(newId);
  };

  const duplicateSlope = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const source = slopes.find(s => s.id === id);
      if (!source) return;
      const newId = `slope-${Date.now()}`;
      setSlopes(prev => [...prev, {
          ...source,
          id: newId,
          name: `${source.name} (Копія)`,
          vertices: source.vertices.map(v => ({...v})),
          holes: source.holes.map(h => h.map(v => ({...v}))),
          sheets: source.sheets.map(s => ({...s, id: s.id + '-copy'})),
          layoutOffset: { ...source.layoutOffset }
      }]);
      setActiveSlopeId(newId);
  };

  const removeSlope = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (slopes.length <= 1) return;
      const newSlopes = slopes.filter(s => s.id !== id);
      setSlopes(newSlopes);
      if (activeSlopeId === id) setActiveSlopeId(newSlopes[0].id);
  };

  const startRenameSlope = () => {
      setTempSlopeName(activeSlope.name);
      setIsRenamingSlope(true);
  };

  const finishRenameSlope = () => {
      if (tempSlopeName.trim()) {
          updateActiveSlope(() => ({ name: tempSlopeName.trim() }));
      }
      setIsRenamingSlope(false);
  };

  const addVertex = () => {
      const targetPolyIndex = selectedHoleIndex !== null ? selectedHoleIndex : -1;
      if (targetPolyIndex === -1) {
          const v = [...vertices];
          v.splice(1, 0, { x: (vertices[0].x+vertices[1].x)/2, y: (vertices[0].y+vertices[1].y)/2 });
          setVertices(v);
      } else {
          setHoles(prev => {
              const next = [...prev];
              const poly = [...next[targetPolyIndex]];
              const p1 = poly[0];
              const p2 = poly[1];
              poly.splice(1, 0, { x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2 });
              next[targetPolyIndex] = poly;
              return next;
          });
      }
  };

  const deleteElement = () => { 
      if (selectedVertex) {
          if (selectedVertex.polyIndex === -1) {
             if (vertices.length > 3) {
                 setVertices(prev => prev.filter((_, i) => i !== selectedVertex.vertIndex));
                 setSelectedVertex(null);
             }
          } else {
             setHoles(prev => {
                 const next = [...prev];
                 const poly = next[selectedVertex.polyIndex];
                 if (poly.length <= 3) return next.filter((_, i) => i !== selectedVertex.polyIndex);
                 else {
                     next[selectedVertex.polyIndex] = poly.filter((_, i) => i !== selectedVertex.vertIndex);
                     return next;
                 }
             });
             setSelectedVertex(null);
          }
          return;
      }
      if (selectedHoleIndex !== null) {
          setHoles(prev => prev.filter((_, i) => i !== selectedHoleIndex));
          setSelectedHoleIndex(null);
          setActiveElement(null);
          return;
      }
      if (activeElement) {
          if (activeElement.polyIndex === -1) {
             if (vertices.length > 3) setVertices(prev => prev.filter((_, i) => i !== activeElement.vertIndex));
          } else {
             setHoles(prev => {
                 const next = [...prev];
                 const poly = next[activeElement.polyIndex];
                 if (poly.length <= 3) return next.filter((_, i) => i !== activeElement.polyIndex);
                 else {
                     next[activeElement.polyIndex] = poly.filter((_, i) => i !== activeElement.vertIndex);
                     return next;
                 }
             });
             setActiveElement(null);
          }
      } else {
          if (vertices.length > 3) setVertices(prev => prev.slice(0, -1));
      }
  };

  const addHole = () => {
      const minX = Math.min(...vertices.map(p => p.x));
      const maxX = Math.max(...vertices.map(p => p.x));
      const minY = Math.min(...vertices.map(p => p.y));
      const maxY = Math.max(...vertices.map(p => p.y));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const size = 1000;
      const startX = Math.max(0, cx - size/2);
      const startY = Math.max(0, cy - size/2);
      const newHole = [{x:startX,y:startY},{x:startX+size,y:startY},{x:startX+size,y:startY+size},{x:startX,y:startY+size}];
      setHoles([...holes, newHole]);
      setSelectedHoleIndex(holes.length);
  };

  const updatePicketGap = (newGap: number) => setMaterial(prev => ({ ...prev, gap: newGap, effectiveWidth: prev.totalWidth + newGap }));
  const updatePicketWidth = (newWidth: number) => {
      const density = Number(picketDensity);
      if (autoGapMode && density > 0) {
          setMaterial(prev => {
             const newGap = (1000 / density) - newWidth;
             return { ...prev, totalWidth: newWidth, gap: newGap, effectiveWidth: newWidth + newGap };
          });
      } else {
          setMaterial(prev => ({ ...prev, totalWidth: newWidth, effectiveWidth: newWidth + (prev.gap || 0) }));
      }
  };

  const pointRadius = Math.max(50, 10 / uiScale);

  const slopePath = useMemo(() => {
     return `M ${vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z ${holes.map(h => `M ${h.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`).join(' ')}`;
  }, [vertices, holes]);

  // --- RENDER ---
  if (step === 'material') {
    return (
      <div className="w-full h-screen bg-gray-50 flex flex-col overflow-hidden">
        <div className="bg-blue-600 p-6 text-white text-center shrink-0">
            <LayoutGrid size={48} className="mx-auto mb-2 opacity-90"/>
            <h1 className="text-2xl font-bold">Roof Master</h1>
            <p className="text-blue-100 text-sm">Оберіть матеріал</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
             {Object.values(MATERIAL_PRESETS).map(m => (
               <button 
                 key={m.type} 
                 onClick={() => {
                     setMaterial(m);
                     setAutoGapMode(false); // Завжди скидати режим авто, щоб синхронізувати з пресетом
                 }} 
                 className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${material.type === m.type ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}
               >
                 <div className="text-current">
                    {m.type === 'tile' && <Grid3X3 />}
                    {m.type === 'profile' && <Columns />}
                    {m.type === 'siding' && <AlignJustify />}
                    {m.type === 'picket' && <MoreHorizontal />}
                 </div>
                 <div className="font-bold text-xs text-center">{m.name}</div>
               </button>
             ))}
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-700 text-sm border-b pb-2 flex items-center justify-between">
                    {material.name} <Settings size={14} className="text-gray-400"/>
                </h3>
                
                {material.type === 'picket' ? (
                    <>
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-3 shadow-inner">
                        <button
                            onClick={() => setAutoGapMode(false)}
                            className={`flex-1 text-[11px] font-bold py-1.5 rounded transition ${!autoGapMode ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                            Зазор вручну
                        </button>
                        <button
                            onClick={() => {
                                setAutoGapMode(true);
                                const density = Number(picketDensity);
                                if (density > 0) {
                                    setMaterial(prev => {
                                        const newGap = (1000 / density) - prev.totalWidth;
                                        return { ...prev, gap: newGap, effectiveWidth: prev.totalWidth + newGap };
                                    });
                                }
                            }}
                            className={`flex-1 text-[11px] font-bold py-1.5 rounded transition ${autoGapMode ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                            Авто за кількістю
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Ширина (см)</label>
                            <input
                                type="number"
                                value={material.totalWidth / 10}
                                onChange={(e) => updatePicketWidth(+e.target.value * 10)}
                                className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"
                            />
                        </div>
                        <div>
                            {autoGapMode ? (
                                <>
                                    <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Шт. на 1 м.п.</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="1"
                                        value={picketDensity}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setPicketDensity(val === '' ? '' : val);
                                            const density = Number(val);
                                            if (density > 0) {
                                                setMaterial(prev => {
                                                    const newGap = (1000 / density) - prev.totalWidth;
                                                    return { ...prev, gap: newGap, effectiveWidth: prev.totalWidth + newGap };
                                                });
                                            }
                                        }}
                                        className="w-full border rounded-lg p-2 text-lg font-bold bg-blue-50 border-blue-200"
                                    />
                                </>
                            ) : (
                                <>
                                    <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Зазор (см)</label>
                                    <input
                                        type="number"
                                        value={(material.gap || 0) / 10}
                                        onChange={(e) => updatePicketGap(+e.target.value * 10)}
                                        className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"
                                    />
                                </>
                            )}
                        </div>
                        <div className="col-span-2">
                             <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Макс висота (см)</label>
                             <input type="number" value={material.maxLength / 10} onChange={(e) => setMaterial(prev => ({...prev, maxLength: +e.target.value * 10}))} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                        </div>
                    </div>
                    
                    <div className="pt-2 border-t mt-2">
                         <label className="text-[10px] text-gray-500 font-bold uppercase block mb-2">Шаблон верху</label>
                         <div className="grid grid-cols-2 gap-2 mb-3">
                            <button onClick={() => setMaterial(prev => ({...prev, picketProfile: 'straight'}))} className={`p-2 rounded border flex flex-col items-center gap-1 ${material.picketProfile === 'straight' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200'}`}>
                                <Minus size={16}/>
                                <span className="text-[10px] font-bold">Прямий</span>
                            </button>
                            <button onClick={() => setMaterial(prev => ({...prev, picketProfile: 'convex'}))} className={`p-2 rounded border flex flex-col items-center gap-1 ${material.picketProfile === 'convex' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200'}`}>
                                <TrendingUp size={16}/>
                                <span className="text-[10px] font-bold">Арка</span>
                            </button>
                         </div>
                         
                         {material.picketProfile !== 'straight' && (
                             <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Мін. висота (см)</label>
                                <input type="number" value={(material.minLength || 0) / 10} onChange={(e) => setMaterial(prev => ({...prev, minLength: +e.target.value * 10}))} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                             </div>
                         )}
                    </div>

                    <div className="col-span-2 bg-blue-50 p-2 rounded text-xs text-blue-700 flex flex-col gap-1 mt-2">
                        <div className="flex items-center gap-2">
                            <Info size={14}/>
                            <span>Крок монтажу (ширина + зазор): <b>{(material.effectiveWidth / 10).toFixed(1)} см</b></span>
                        </div>
                        {autoGapMode && (
                            <div className="flex items-center gap-2 ml-5">
                                <span className="opacity-80">↳ Орієнтовний зазор (на 1м):</span> <b>{((material.gap || 0) / 10).toFixed(2)} см</b>
                            </div>
                        )}
                    </div>
                    </>
                ) : (
                    <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">
                                {material.type === 'siding' ? 'Повна висота' : 'Повна ширина'}
                            </label>
                            <input type="number" value={material.totalWidth} onChange={(e) => setMaterial({...material, totalWidth: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">
                                {material.type === 'siding' ? 'Корисна висота' : 'Корисна ширина'}
                            </label>
                            <input type="number" value={material.effectiveWidth} onChange={(e) => setMaterial({...material, effectiveWidth: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 flex items-center gap-2">
                       <Info size={14}/>
                       <span>
                          {material.type === 'siding' ? 'Вертикальний' : 'Бічний'} нахлест (авто): <b>{material.totalWidth - material.effectiveWidth} мм</b>
                       </span>
                    </div>

                    {(material.type === 'tile' || material.type === 'profile' || material.type === 'siding') && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t mt-2">
                             <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Макс довжина (мм)</label>
                                <input type="number" value={material.maxLength} onChange={(e) => setMaterial({...material, maxLength: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                             </div>
                             <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">
                                    Нахлест по висоті (мм)
                                </label>
                                <input type="number" value={material.overlap || 0} onChange={(e) => {
                                    const val = +e.target.value;
                                    setMaterial(material.type === 'tile' 
                                        ? {...material, overlap: val, waveTail: val} 
                                        : {...material, overlap: val}
                                    );
                                }} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                             </div>
                        </div>
                    )}

                    {material.type === 'tile' && (
                        <>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t mt-2">
                                 <div>
                                    <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Крок хвилі (мм)</label>
                                    <input type="number" value={material.waveStep || 350} onChange={(e) => setMaterial({...material, waveStep: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                                 </div>
                                 <div>
                                    <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Хвіст / звис (мм)</label>
                                    <input type="number" value={material.waveTail || 150} onChange={(e) => setMaterial({...material, waveTail: +e.target.value, overlap: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                                 </div>
                            </div>
                            <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 text-xs text-orange-800 space-y-1 mt-2">
                                <div className="font-bold flex items-center gap-1"><Info size={14}/> Допустимі стандартні розміри</div>
                                <p className="opacity-90">Щоб уникнути різу по сходинці (замок хвилі), система округляє розміри вверх (до 50мм) і обходить "мертві зони":</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {(() => {
                                        const demoSizes = [];
                                        const wStep = material.waveStep || 350;
                                        const wTail = material.waveTail || 150;
                                        for (let n = 1; n <= 3; n++) {
                                            const base = n * wStep + wTail - wStep; 
                                            for (let off = 0; off <= 200; off += 50) {
                                                const len = base + off;
                                                if (len <= material.maxLength) demoSizes.push(len);
                                            }
                                        }
                                        return demoSizes.map((len, idx) => (
                                            <span key={idx} className="bg-white px-1.5 py-0.5 rounded border border-orange-200 text-[10px] font-bold shadow-sm">{len}</span>
                                        ));
                                    })()}
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold text-orange-600">...</span>
                                </div>
                            </div>
                        </>
                    )}
                    </>
                )}
            </div>
        </div>

        <div className="p-4 bg-white border-t shrink-0">
             <button onClick={() => setStep('geometry')} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]">
               Далі <ChevronRight />
             </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 text-gray-800 font-sans select-none overflow-hidden relative">
      
      {/* TEMPLATE MODAL */}
      {showTemplates && (
        <div className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
             <div className="flex justify-between items-center p-4 border-b bg-gray-50">
               <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                 <LayoutTemplate className="text-blue-600"/>
                 Оберіть шаблон форми
               </h2>
               <button onClick={() => setShowTemplates(false)} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20}/></button>
             </div>
             
             <div className="overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {ROOF_TEMPLATES.map(tmpl => {
                    const mapped = tmpl.points.map(p => ({ x: p.x, y: -p.y }));
                    const minX = Math.min(...mapped.map(p => p.x));
                    const maxX = Math.max(...mapped.map(p => p.x));
                    const minY = Math.min(...mapped.map(p => p.y));
                    const maxY = Math.max(...mapped.map(p => p.y));
                    const w = maxX - minX;
                    const h = maxY - minY;
                    const padX = w * 0.15 || 500;
                    const padY = h * 0.15 || 500;
                    const vb = `${minX - padX} ${minY - padY} ${w + padX * 2} ${h + padY * 2}`;
                    const pathD = `M ${mapped.map(p => `${p.x} ${p.y}`).join(' L ')} Z`;
                    
                    return (
                        <button key={tmpl.id} onClick={() => applyTemplate(tmpl.points)} className="flex flex-col items-center gap-2 p-3 border rounded-xl hover:border-blue-500 hover:bg-blue-50 transition group">
                            <div className="w-24 h-24 bg-white border rounded-lg flex items-center justify-center p-2 group-hover:shadow-sm transition">
                                <svg viewBox={vb} className="w-full h-full text-blue-500 fill-blue-50 stroke-current drop-shadow-sm" style={{ strokeWidth: Math.max(w,h)*0.04, strokeLinejoin: 'round' }}>
                                    <path d={pathD} />
                                </svg>
                            </div>
                            <span className="text-xs font-bold text-center text-gray-700 group-hover:text-blue-700">{tmpl.name}</span>
                        </button>
                    );
                })}
             </div>
          </div>
        </div>
      )}

      {/* AI MODAL */}
      {showAiModal && (
          <div className="absolute inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="bg-white w-full sm:max-w-md h-[80vh] sm:h-[600px] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-2">
                          <Sparkles size={20}/>
                          <span className="font-bold">AI Помічник</span>
                      </div>
                      <button onClick={() => setShowAiModal(false)} className="hover:bg-white/20 p-1 rounded-full"><X size={20}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                      {aiMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] p-3 rounded-2xl text-sm whitespace-pre-line ${
                                  msg.role === 'user' 
                                  ? 'bg-blue-600 text-white rounded-br-none' 
                                  : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'
                              }`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                      {aiLoading && (
                          <div className="flex justify-start">
                              <div className="bg-white border p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2 text-sm text-gray-500">
                                  <Loader2 size={16} className="animate-spin text-blue-600"/>
                                  Аналізую проект...
                              </div>
                          </div>
                      )}
                      <div ref={chatEndRef} />
                  </div>

                  <div className="p-3 bg-white border-t flex gap-2">
                      <input 
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
                        placeholder="Запитайте щось про дах..."
                        className="flex-1 border bg-gray-50 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button onClick={handleAiSend} disabled={aiLoading || !aiInput.trim()} className="bg-blue-600 text-white p-2 rounded-full disabled:opacity-50 hover:bg-blue-700 transition">
                          <Send size={18}/>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* HEADER & SLOPE TABS */}
      <div className="flex-none bg-white shadow-sm z-50 flex flex-col border-b relative">
         <div className="h-14 flex items-center justify-between px-4 border-b">
             <div className="flex items-center gap-3">
               <button onClick={() => setStep('material')} className="p-2 hover:bg-gray-100 rounded-lg active:bg-gray-200"><Settings size={20} className="text-gray-500"/></button>
               <div className="flex flex-col">
                  <span className="font-bold text-sm leading-tight truncate max-w-[120px]">{material.name}</span>
                  <span className="text-[10px] text-gray-400">{step === 'geometry' ? 'Форма' : 'Розкладка'}</span>
               </div>
             </div>
             <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-lg p-0.5 border">
                    <button onClick={handleUndo} disabled={history.index === 0} className="p-1.5 text-gray-600 hover:bg-white rounded disabled:opacity-30 transition disabled:bg-transparent"><Undo size={16}/></button>
                    <button onClick={handleRedo} disabled={history.index === history.list.length - 1} className="p-1.5 text-gray-600 hover:bg-white rounded disabled:opacity-30 transition disabled:bg-transparent"><Redo size={16}/></button>
                </div>
                <button 
                    onClick={startAiAnalysis}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-indigo-100"
                >
                    <Sparkles size={14}/> AI
                </button>
                {step === 'geometry' ? (
                    <button onClick={() => { setLayoutOffset({x:0, y:0}); setStep('layout'); }} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow flex items-center gap-2">
                       <Calculator size={14}/>
                    </button>
                ) : (
                    <div className="flex gap-2">
                        {step === 'layout' && (
                            <button onClick={handleExportPdf} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow hover:bg-green-700 active:bg-green-800">
                                 <Download size={14}/> PDF
                            </button>
                        )}
                        <button onClick={() => { setStep('geometry'); setSheets([]); }} className="bg-white border text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1 active:bg-gray-200">
                            <ArrowLeft size={14}/>
                        </button>
                    </div>
                )}
             </div>
         </div>
         
         {/* SLOPE TABS */}
         <div className="flex items-center px-2 py-1 gap-1 overflow-x-auto bg-gray-50 no-scrollbar">
             {slopes.map(slope => (
                 <div key={slope.id} 
                    onClick={() => setActiveSlopeId(slope.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b-2 text-xs font-bold cursor-pointer whitespace-nowrap transition ${activeSlopeId === slope.id ? 'border-blue-600 bg-white text-blue-700' : 'border-transparent text-gray-500 hover:bg-gray-200'}`}
                 >
                     {isRenamingSlope && activeSlopeId === slope.id ? (
                         <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                             <input 
                                autoFocus
                                value={tempSlopeName} 
                                onChange={e => setTempSlopeName(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && finishRenameSlope()}
                                onBlur={finishRenameSlope}
                                className="w-20 bg-blue-50 border border-blue-200 px-1 rounded text-xs outline-none"
                             />
                             <button onClick={finishRenameSlope} className="text-green-600"><Check size={12}/></button>
                         </div>
                     ) : (
                         <span className="flex items-center gap-1">
                             {slope.name}
                             {activeSlopeId === slope.id && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); startRenameSlope(); }} className="p-0.5 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-600" title="Перейменувати">
                                        <Edit2 size={10}/>
                                    </button>
                                    <button onClick={(e) => duplicateSlope(e, slope.id)} className="p-0.5 hover:bg-green-100 rounded text-green-500 hover:text-green-600" title="Копіювати схил">
                                        <Copy size={10}/>
                                    </button>
                                </>
                             )}
                         </span>
                     )}
                     
                     {slopes.length > 1 && (
                         <button onClick={(e) => removeSlope(e, slope.id)} className="p-0.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500" title="Видалити">
                             <X size={12}/>
                         </button>
                     )}
                 </div>
             ))}
             <button onClick={addSlope} className="px-2 py-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Додати схил">
                 <Plus size={16}/>
             </button>
         </div>
      </div>

      {/* CANVAS */}
      <main className="flex-1 relative overflow-hidden bg-gray-100 touch-none w-full">
         
         {/* STATS PANEL */}
         {step !== 'material' && (
             <div className="absolute top-4 left-4 z-40">
                {isStatsOpen ? (
                    <div className="bg-white/90 backdrop-blur-md shadow-lg rounded-xl border border-gray-200 p-3 w-48 transition-all animate-in fade-in slide-in-from-left-4">
                        <div className="flex justify-between items-center mb-2 border-b pb-1">
                            <span className="text-xs font-bold text-gray-500 uppercase">Статистика ({activeSlope.name})</span>
                            <button onClick={() => setIsStatsOpen(false)} className="text-gray-400 hover:text-gray-600"><ChevronUp size={16}/></button>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-gray-700">
                                    <Square size={16}/>
                                    <span className="text-xs">Площа схилу</span>
                                </div>
                                <span className="text-xs font-bold">{polygonArea.toFixed(2)} м²</span>
                            </div>

                            {step === 'layout' && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            <LayoutGrid size={16}/>
                                            <span className="text-xs">{material.type === 'picket' ? 'Метри погонні' : 'Площа листів'}</span>
                                        </div>
                                        <span className="text-xs font-bold">
                                            {material.type === 'picket' ? `${sheetsLinear.toFixed(2)} м.п.` : `${sheetsArea.toFixed(2)} м²`}
                                        </span>
                                    </div>

                                    {material.type === 'picket' && (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-gray-700">
                                                <AlignJustify size={16}/>
                                                <span className="text-xs">Зазор штахет</span>
                                            </div>
                                            <span className="text-xs font-bold text-orange-600">
                                                {Math.max(0, activeSlopeGap / 10).toFixed(2)} см
                                            </span>
                                        </div>
                                    )}

                                    {material.type !== 'picket' && (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-gray-700">
                                                <Scissors size={16}/>
                                                <span className="text-xs">Відходи</span>
                                            </div>
                                            <span className={`text-xs font-bold ${wastePercentage > 15 ? 'text-red-500' : 'text-green-600'}`}>
                                                {wastePercentage.toFixed(1)}%
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            <Layers size={16}/>
                                            <span className="text-xs">Кількість</span>
                                        </div>
                                        <span className="text-xs font-bold">{sheets.length} шт</span>
                                    </div>
                                    
                                    <div className="pt-2 border-t mt-1">
                                        <div className="flex items-center gap-2 text-gray-700 mb-1">
                                            <Ruler size={14}/>
                                            <span className="text-[10px] font-bold uppercase">Специфікація</span>
                                        </div>
                                        <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                            {activeSheetGroups.map(([len, count]) => (
                                                <div key={len} className="flex justify-between text-[10px] bg-gray-100 px-2 py-1 rounded">
                                                    <span>{material.type === 'picket' ? Math.round(Number(len)/10) + ' см' : len + ' мм'}</span>
                                                    <span className="font-bold text-gray-600">x {count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200">
                             <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Загалом по проекту</div>
                             <div className="flex justify-between items-center text-xs">
                                 <span>{material.type === 'picket' ? 'Всього м.п.:' : 'Площа:'}</span>
                                 <span className="font-bold">
                                     {material.type === 'picket' 
                                        ? `${totalProjectStats.totalSheetsLinear.toFixed(2)} м.п.` 
                                        : `${totalProjectStats.totalArea.toFixed(1)} м²`}
                                 </span>
                             </div>
                             <div className="flex justify-between items-center text-xs mt-1">
                                 <span>Всього листів:</span>
                                 <span className="font-bold">{totalProjectStats.totalSheetsCount} шт</span>
                             </div>
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={() => setIsStatsOpen(true)}
                        className="bg-white shadow-md border rounded-full p-2 text-gray-600 hover:bg-gray-50 flex items-center gap-2 pr-3"
                    >
                        <FileText size={18}/>
                        <span className="text-xs font-bold">Інфо</span>
                    </button>
                )}
             </div>
         )}

         {/* LAYOUT MOVER CONTROLS */}
         {step === 'layout' && (
             <div className="absolute bottom-4 right-4 z-40 flex flex-col items-center gap-1 bg-white/90 p-2 rounded-xl shadow-lg border border-gray-200 backdrop-blur-sm">
                 <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">Зсув (1см)</span>
                 <button onClick={() => moveLayout(0, -10)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg active:bg-gray-300 transition" title="Вгору">
                   <ArrowUp size={20} className="text-gray-700"/>
                 </button>
                 <div className="flex gap-1">
                     <button onClick={() => moveLayout(-10, 0)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg active:bg-gray-300 transition" title="Вліво">
                       <ArrowLeft size={20} className="text-gray-700"/>
                     </button>
                     <button onClick={() => moveLayout(10, 0)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg active:bg-gray-300 transition" title="Вправо">
                       <ArrowRight size={20} className="text-gray-700"/>
                     </button>
                 </div>
                 <button onClick={() => moveLayout(0, 10)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg active:bg-gray-300 transition" title="Вниз">
                   <ArrowDown size={20} className="text-gray-700"/>
                 </button>
             </div>
         )}

         <div 
           ref={containerRef}
           className="absolute inset-0 w-full h-full cursor-crosshair"
           onPointerDown={(e) => handlePointerDown(e, 'bg')}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerLeave={handlePointerUp}
         >
           <div className="absolute top-4 right-4 flex flex-col gap-2 z-40">
              <button onClick={handleZoomIn} className="p-3 bg-white shadow-md rounded-full text-blue-600 active:bg-blue-50">
                 <Plus size={24}/>
              </button>
              <button onClick={handleZoomOut} className="p-3 bg-white shadow-md rounded-full text-blue-600 active:bg-blue-50">
                 <Minus size={24}/>
              </button>
              <button onClick={fitView} className="p-3 bg-white shadow-md rounded-full text-blue-600 active:bg-blue-50 mt-2">
                 <Focus size={24}/>
              </button>
           </div>

           <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
             <defs>
                 <GridBackground />
                 <clipPath id="slope-clip">
                     <path d={slopePath} clipRule="evenodd" />
                 </clipPath>
             </defs>
             <g ref={canvasRef} style={{ transformOrigin: '0 0', willChange: 'transform' }}>
                 <rect x="-40000" y="-40000" width="80000" height="80000" fill="url(#grid)" />
                 
                 {/* --- COORDINATE LABELS (1m steps) --- */}
                 <g opacity="0.6">
                    {Array.from({length: 81}).map((_, i) => {
                        const x = (i - 40) * 1000;
                        if (x === 0) return null;
                        return <text key={`x-${i}`} x={x} y="150" fontSize="120" fill="#EF4444" textAnchor="middle" fontWeight="bold">{x/1000}м</text>
                    })}
                    {Array.from({length: 81}).map((_, i) => {
                        const y = (i - 40) * 1000;
                        if (y === 0) return null;
                        return <text key={`y-${i}`} x="-150" y={y} fontSize="120" fill="#10B981" textAnchor="end" dominantBaseline="central" fontWeight="bold">{-y/1000}м</text>
                    })}
                 </g>

                 {/* --- AXES (Visual Guides) --- */}
                 <line x1="-40000" y1="0" x2="40000" y2="0" stroke="#EF4444" strokeWidth="4" strokeOpacity="0.6" /> 
                 <line x1="0" y1="-40000" x2="0" y2="40000" stroke="#10B981" strokeWidth="4" strokeOpacity="0.6" /> 

                 {/* --- 1. Background Fill (Bottom Layer) --- */}
                 <path 
                   d={slopePath}
                   fill="#94A3B8" stroke="none" fillRule="evenodd" opacity="0.5"
                 />
                 
                 {/* --- 2. Sheets (Middle Layer) --- */}
                 <g>
                   {step === 'layout' && sheets.map(sheet => {
                       const svgPos = toSvg({x: sheet.x, y: sheet.y + sheet.length});
                       const isSiding = material.type === 'siding';
                       const isPicket = material.type === 'picket';
                       const isSelected = selectedSheetIds.includes(sheet.id);
                       const strokeW = isSelected ? 25 : (isSiding ? 2 : 5);
                       
                       const rotateText = !isSiding; 
                       const cx = sheet.width / 2;
                       const cy = sheet.length / 2;

                       let fontSize = 150;
                       if (isSiding) {
                           fontSize = sheet.length * 0.4;
                       } else if (isPicket) {
                           fontSize = Math.min(sheet.length * 0.4, 140); 
                       } else {
                           fontSize = Math.min(sheet.length * 0.3, sheet.width * 0.25);
                           if (fontSize < 150) fontSize = 150; 
                       }

                       const labelText = sheet.label.toString();

                       return (
                           <g key={sheet.id} transform={`translate(${svgPos.x}, ${svgPos.y})`}
                             onPointerDown={(e) => handlePointerDown(e, 'sheet', sheet.id)}
                           >
                             <rect 
                               width={sheet.width} 
                               height={sheet.length} 
                               fill={sheet.color} 
                               fillOpacity={0.2} 
                               stroke={isSelected ? '#F97316' : '#EF4444'} 
                               strokeWidth={strokeW} 
                               strokeDasharray={isSelected ? 'none' : '20,10'}
                             />
                             <g transform={`translate(${cx}, ${cy}) rotate(${rotateText ? -90 : 0})`}>
                                 <text 
                                   textAnchor="middle" 
                                   dominantBaseline="central"
                                   fontSize={fontSize}
                                   fontWeight="bold"
                                   stroke="white"
                                   strokeWidth={fontSize * 0.1}
                                   fill="none"
                                   className="pointer-events-none"
                                 >
                                   {labelText}
                                 </text>
                                 <text 
                                   textAnchor="middle" 
                                   dominantBaseline="central"
                                   fontSize={fontSize}
                                   fontWeight="bold"
                                   fill={isSelected ? '#C2410C' : '#7F1D1D'}
                                   className="pointer-events-none"
                                 >
                                   {labelText}
                                 </text>
                             </g>
                           </g>
                       )
                   })}
                 </g>
                 
                 {/* --- 3. Outlines and Highlights (Top Layer) --- */}
                 <path 
                   d={`M ${vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`}
                   fill="none" stroke="#2563EB" strokeOpacity="0.5" strokeWidth="5" vectorEffect="non-scaling-stroke"
                 />
                 
                 {holes.map((hole, hi) => (
                   <g key={`hg-${hi}`}>
                     <path 
                       d={`M ${hole.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`}
                       fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeOpacity="0.5" strokeWidth="4" strokeDasharray="10,10" vectorEffect="non-scaling-stroke"
                     />
                     {step === 'geometry' && (() => {
                         const center = getCentroid(hole);
                         const centerSvg = toSvg(center);
                         const isSelected = selectedHoleIndex === hi;
                         const fs = pointRadius * 1.5;
                         return (
                             <g 
                               transform={`translate(${centerSvg.x}, ${centerSvg.y})`}
                               onPointerDown={(e) => handlePointerDown(e, 'hole-move', hi)}
                               className="cursor-move"
                             >
                                 <circle r={fs} fill={isSelected ? "#EF4444" : "white"} stroke="#DC2626" strokeWidth="4" />
                                 <Move size={fs} x={-fs/2} y={-fs/2} color={isSelected ? "white" : "#DC2626"} />
                             </g>
                         )
                     })()}
                   </g>
                 ))}

                 {step === 'geometry' && vertices.map((p, i) => {
                   const svgP = toSvg(p);
                   const isSelected = selectedVertex?.polyIndex === -1 && selectedVertex?.vertIndex === i;
                   return (
                       <g key={`v-${i}`} transform={`translate(${svgP.x}, ${svgP.y})`}
                           onPointerDown={(e) => handlePointerDown(e, 'vertex', { polyIndex: -1, vertIndex: i })}
                       >
                           <circle r={pointRadius * 3} fill="transparent" /> 
                           <circle r={pointRadius * (isSelected ? 1.2 : 0.8)} fill={isSelected ? "#16A34A" : "white"} stroke={isSelected ? "#15803D" : "#2563EB"} strokeWidth={pointRadius*0.3} />
                           <text y={-pointRadius*1.5} textAnchor="middle" fill={isSelected ? "#15803D" : "#2563EB"} fontSize={pointRadius*1.2} fontWeight="bold" className="pointer-events-none">{i+1}</text>
                       </g>
                   )
                 })}

                 {step === 'geometry' && holes.map((hole, hi) => (
                     hole.map((p, i) => {
                       const svgP = toSvg(p);
                       const isSelected = selectedVertex?.polyIndex === hi && selectedVertex?.vertIndex === i;
                       return (
                           <g key={`h-${hi}-${i}`} transform={`translate(${svgP.x}, ${svgP.y})`}
                               onPointerDown={(e) => handlePointerDown(e, 'vertex', { polyIndex: hi, vertIndex: i })}
                           >
                               <circle r={pointRadius * 3} fill="transparent" /> 
                               <circle r={pointRadius * (isSelected ? 1.2 : 0.8)} fill={isSelected ? "#16A34A" : "white"} stroke={isSelected ? "#15803D" : "#EF4444"} strokeWidth={pointRadius*0.3} />
                           </g>
                       )
                     })
                 ))}

                 {step === 'geometry' && vertices.map((p, i) => {
                   const next = vertices[(i+1)%vertices.length];
                   const svgP = toSvg(p);
                   const svgNext = toSvg(next);
                   const mx = (svgP.x+svgNext.x)/2;
                   const my = (svgP.y+svgNext.y)/2;
                   const dist = Math.hypot(next.x-p.x, next.y-p.y);
                   const fs = pointRadius * 1.0;
                   const isSelected = selectedEdge?.polyIndex === -1 && selectedEdge?.vertIndex === i;
                   return (
                     <g 
                       key={`d-${i}`} 
                       onClick={(e) => { 
                           e.stopPropagation(); 
                           setSelectedEdge({ polyIndex: -1, vertIndex: i }); 
                           setIsEditingHeight(false);
                           setSelectedVertex(null);
                           setManualLength(Math.round(dist).toString());
                       }}
                       className="cursor-pointer hover:opacity-80"
                     >
                         <rect 
                           x={mx - fs*2.5} y={my - fs/1.2} 
                           width={fs*5} height={fs*1.8} 
                           rx={fs/2} 
                           fill={isSelected ? "#2563EB" : "white"} 
                           stroke={isSelected ? "#1D4ED8" : "#CBD5E1"} 
                           strokeWidth="5"
                         />
                         <text 
                           x={mx} y={my + fs/2.5} 
                           textAnchor="middle" 
                           fontSize={fs} 
                           fill={isSelected ? "white" : "#1E293B"} 
                           fontWeight="bold"
                         >
                           {Math.round(dist)}
                         </text>
                     </g>
                   )
                 })}
                 
                 {step === 'geometry' && (() => {
                     const ys = vertices.map(p => p.y);
                     const minY = Math.min(...ys);
                     const maxY = Math.max(...ys);
                     const xs = vertices.map(p => p.x);
                     const minX = Math.min(...xs);
                     const maxX = Math.max(...xs);
                     const centerX = (minX + maxX) / 2;
                     const height = maxY - minY;
                     const fs = pointRadius * 1.0;
                     
                     const svgTop = toSvg({x: centerX, y: maxY});
                     const svgBottom = toSvg({x: centerX, y: minY});
                     
                     return (
                         <g 
                           onClick={(e) => {
                               e.stopPropagation();
                               setIsEditingHeight(true);
                               setSelectedEdge(null);
                               setSelectedVertex(null);
                               setManualLength(Math.round(height).toString());
                           }}
                           className="cursor-pointer hover:opacity-80 group"
                         >
                             <line 
                               x1={centerX} y1={svgBottom.y} 
                               x2={centerX} y2={svgTop.y} 
                               stroke={isEditingHeight ? "#8B5CF6" : "#A78BFA"} 
                               strokeWidth="4" 
                               strokeDasharray="20,20"
                             />
                             <path d={`M ${centerX} ${svgBottom.y} L ${centerX-15} ${svgBottom.y-30} L ${centerX+15} ${svgBottom.y-30} Z`} fill={isEditingHeight ? "#8B5CF6" : "#A78BFA"} />
                             <path d={`M ${centerX} ${svgTop.y} L ${centerX-15} ${svgTop.y+30} L ${centerX+15} ${svgTop.y+30} Z`} fill={isEditingHeight ? "#8B5CF6" : "#A78BFA"} />
                             
                             <rect 
                               x={centerX - fs*3} y={(svgTop.y+svgBottom.y)/2 - fs} 
                               width={fs*6} height={fs*2} 
                               rx={fs/2} 
                               fill={isEditingHeight ? "#8B5CF6" : "white"} 
                               stroke={isEditingHeight ? "#7C3AED" : "#C4B5FD"} 
                               strokeWidth="5"
                             />
                             <text 
                               x={centerX} y={(svgTop.y+svgBottom.y)/2 + fs/2.5} 
                               textAnchor="middle" 
                               fontSize={fs} 
                               fill={isEditingHeight ? "white" : "#6D28D9"} 
                               fontWeight="bold"
                               className="flex items-center"
                             >
                                {Math.round(height)}
                             </text>
                         </g>
                     );
                 })()}

                 {step === 'geometry' && holes.map((hole, hi) => (
                     hole.map((p, i) => {
                       const next = hole[(i+1)%hole.length];
                       const svgP = toSvg(p);
                       const svgNext = toSvg(next);
                       const mx = (svgP.x+svgNext.x)/2;
                       const my = (svgP.y+svgNext.y)/2;
                       const dist = Math.hypot(next.x-p.x, next.y-p.y);
                       const fs = pointRadius * 0.8;
                       const isSelected = selectedEdge?.polyIndex === hi && selectedEdge?.vertIndex === i;
                       return (
                         <g 
                           key={`hd-${hi}-${i}`} 
                           onClick={(e) => { 
                               e.stopPropagation(); 
                               setSelectedEdge({ polyIndex: hi, vertIndex: i }); 
                               setIsEditingHeight(false);
                               setSelectedVertex(null);
                               setManualLength(Math.round(dist).toString());
                           }}
                           className="cursor-pointer hover:opacity-80"
                         >
                              <rect 
                                x={mx - fs*2.5} y={my - fs/1.2} 
                                width={fs*5} height={fs*1.8} 
                                rx={fs/2} 
                                fill={isSelected ? "#EF4444" : "white"} 
                                stroke={isSelected ? "#B91C1C" : "#FECACA"} 
                                strokeWidth="5"
                              />
                              <text 
                                x={mx} y={my + fs/2.5} 
                                textAnchor="middle" 
                                fontSize={fs} 
                                fill={isSelected ? "white" : "#991B1B"} 
                                fontWeight="bold"
                              >
                                {Math.round(dist)}
                              </text>
                         </g>
                       )
                     })
                 ))}
             </g>
           </svg>
         </div>
      </main>

      {/* FOOTER */}
      <div className="flex-none bg-white border-t z-50 p-2 pb-safe min-h-[70px] flex items-center relative">
         {step === 'geometry' ? (
            selectedEdge !== null ? (
               <div className="flex w-full gap-2 items-center px-2">
                  <div className="flex-1 flex flex-col gap-1">
                     <div className="flex items-center justify-between">
                         <label className="text-[10px] text-blue-600 font-bold uppercase ml-1 flex items-center gap-1">
                            <Ruler size={10}/> Сторона
                         </label>
                         <button 
                            onClick={() => setLockedEdgePoint(prev => prev === 'p1' ? 'p2' : 'p1')}
                            className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold active:bg-blue-200 transition"
                         >
                            🔒 Фікс: {lockedEdgePoint === 'p1' ? 'Точка 1' : 'Точка 2'}
                         </button>
                     </div>
                     <input 
                       type="number" 
                       autoFocus
                       className="w-full border-2 border-blue-500 bg-blue-50 rounded p-2 text-sm font-bold outline-none" 
                       value={manualLength}
                       onChange={(e) => {
                           const val = e.target.value;
                           setManualLength(val);
                           const num = Number(val);
                           if (!isNaN(num) && num > 0) {
                               updateEdgeLength(num, lockedEdgePoint);
                           }
                       }}
                     />
                  </div>
                  <button 
                    onClick={() => setSelectedEdge(null)} 
                    className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs"
                  >
                    ОК
                  </button>
               </div>
            ) : isEditingHeight ? (
               <div className="flex w-full gap-2 items-center px-2">
                  <div className="flex-1">
                     <label className="text-[10px] text-purple-600 font-bold uppercase ml-1 flex items-center gap-1">
                        <ArrowUpDown size={10}/> Висота скату
                     </label>
                     <input 
                       type="number" 
                       autoFocus
                       className="w-full border-2 border-purple-500 bg-purple-50 rounded p-2 text-sm font-bold outline-none" 
                       value={manualLength}
                       onChange={(e) => {
                           const val = e.target.value;
                           setManualLength(val);
                           const num = Number(val);
                           if (!isNaN(num) && num > 0) {
                               updateHeight(num);
                           }
                       }}
                     />
                  </div>
                  <button 
                    onClick={() => setIsEditingHeight(false)} 
                    className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs"
                  >
                    ОК
                  </button>
               </div>
            ) : selectedVertex !== null ? (
                <div className="flex w-full gap-2 items-center px-2">
                   {(() => {
                       const { polyIndex, vertIndex } = selectedVertex;
                       const poly = polyIndex === -1 ? vertices : holes[polyIndex];
                       const p = poly[vertIndex];
                       return (
                           <>
                             <div className="flex flex-1 gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-green-600 font-bold uppercase ml-1 block">X</label>
                                    <input 
                                        type="number" 
                                        value={Math.round(p.x)} 
                                        onChange={(e) => updateVertexCoordinate('x', +e.target.value)}
                                        className="w-full border-2 border-green-500 bg-green-50 rounded p-2 text-sm font-bold outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-green-600 font-bold uppercase ml-1 block">Y</label>
                                    <input 
                                        type="number" 
                                        value={Math.round(p.y)} 
                                        onChange={(e) => updateVertexCoordinate('y', +e.target.value)}
                                        className="w-full border-2 border-green-500 bg-green-50 rounded p-2 text-sm font-bold outline-none"
                                    />
                                </div>
                             </div>
                             <button onClick={deleteElement} className="h-10 px-3 bg-red-100 text-red-700 rounded-lg font-bold text-xs flex items-center justify-center">
                                <Trash2 size={16}/>
                             </button>
                             <button onClick={() => setSelectedVertex(null)} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs">
                                ОК
                             </button>
                           </>
                       )
                   })()}
                </div>
            ) : (
               <div className="flex w-full gap-2 overflow-x-auto no-scrollbar items-center px-1">
                  <button onClick={() => setShowTemplates(true)} className="px-3 py-2 bg-gray-100 rounded text-xs font-bold whitespace-nowrap border border-gray-200 flex items-center gap-1">
                      <LayoutTemplate size={16} className="text-gray-600"/>
                      Шаблони
                  </button>
                  <div className="h-6 w-px bg-gray-300 mx-1 shrink-0"></div>
                  
                  <button onClick={() => rotateShape('ccw')} className="px-3 py-2 bg-gray-100 rounded text-xs font-bold whitespace-nowrap border border-gray-200 flex items-center gap-1 hover:bg-gray-200" title="Повернути вліво">
                      <RotateCcw size={16} className="text-gray-600"/>
                  </button>
                  <button onClick={() => rotateShape('cw')} className="px-3 py-2 bg-gray-100 rounded text-xs font-bold whitespace-nowrap border border-gray-200 flex items-center gap-1 hover:bg-gray-200" title="Повернути вправо">
                      <RotateCw size={16} className="text-gray-600"/>
                  </button>
                  <div className="h-6 w-px bg-gray-300 mx-1 shrink-0"></div>

                  <button onClick={addVertex} className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap"><PlusCircle size={16}/> {selectedHoleIndex !== null ? 'Точку' : 'Додати'}</button>
                  <button onClick={addHole} className="flex-1 px-3 py-2 bg-orange-50 text-orange-700 border border-orange-100 rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap"><MinusSquare size={16}/> Виріз</button>
                  
                  <button onClick={deleteElement} className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap"><Trash2 size={16}/> {selectedHoleIndex !== null ? 'Виріз' : 'Видалити'}</button>
               </div>
            )
         ) : (
             selectedSheetIds.length > 0 ? (
               <div className="flex w-full gap-2 items-center px-2">
                  <button 
                     onClick={() => setIsMultiSelect(!isMultiSelect)}
                     className={`h-10 px-3 rounded-lg border flex items-center justify-center transition ${isMultiSelect ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
                     title="Режим мульти-вибору"
                  >
                     <Layers size={16}/>
                  </button>
                  <div className="flex-1">
                     <label className="text-[10px] text-gray-500 font-bold uppercase ml-1 block">
                        {selectedSheetIds.length > 1 
                            ? `Вибрано: ${selectedSheetIds.length}` 
                            : (material.type === 'picket' ? 'Довжина (см)' : 'Довжина (мм)')}
                     </label>
                     <input 
                       type="number" 
                       placeholder={selectedSheetIds.length > 1 ? "Спільна довжина..." : ""}
                       className="w-full border bg-gray-50 rounded p-2 text-sm font-bold outline-none" 
                       value={(() => {
                           const firstSheet = selectedSheets[0];
                           if (!firstSheet) return "";
                           const allSame = selectedSheets.every(s => 
                               (material.type === 'siding' ? s.width : s.length) === (material.type === 'siding' ? firstSheet.width : firstSheet.length)
                           );
                           if (!allSame) return "";
                           return material.type === 'picket' 
                               ? (firstSheet.length / 10)
                               : (material.type === 'siding' ? firstSheet.width : firstSheet.length);
                       })()}
                       onChange={(e) => {
                           const val = Number(e.target.value);
                           setSheets(prev => prev.map(s => {
                               if (selectedSheetIds.includes(s.id)) {
                                   if (material.type === 'picket') {
                                       const newLength = val * 10;
                                       return { ...s, length: newLength, label: newLength, fullLength: newLength };
                                   } else if (material.type === 'siding') {
                                        return { ...s, width: val, label: val, fullLength: val };
                                   } else {
                                        return { ...s, length: val, label: val, fullLength: val };
                                   }
                               }
                               return s;
                           }));
                       }}
                     />
                     {(() => {
                        if (material.type !== 'tile' || selectedSheets.length === 0) return null;
                        const wave = material.waveStep || 350;
                        const tail = material.waveTail || 150;
                        const firstSheet = selectedSheets[0];
                        
                        let localPos = (firstSheet.length - tail) % wave;
                        if (localPos < 0) localPos += wave;
                        
                        const isDeadZone = localPos > 200 || firstSheet.length % 50 !== 0;
                        if (isDeadZone) {
                            return (
                                <div className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1 leading-tight absolute">
                                    <AlertTriangle size={12}/> Недопустимий розмір
                                </div>
                            );
                        }
                        return null;
                     })()}
                  </div>
                  
                  {/* Кнопки зміни розміру вибраних листів (ТІЛЬКИ ВГОРУ І ВНИЗ) */}
                  <div className="flex flex-col gap-1 mx-1 justify-center border-l border-r border-gray-200 px-2">
                      <button onClick={() => resizeSelectedSheets(10)} className="p-1 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 active:bg-blue-200 transition" title="Збільшити висоту (1 см)">
                          <ArrowUp size={14}/>
                      </button>
                      <button onClick={() => resizeSelectedSheets(-10)} className="p-1 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 active:bg-blue-200 transition" title="Зменшити висоту (-1 см)">
                          <ArrowDown size={14}/>
                      </button>
                  </div>

                  <button onClick={() => { setSheets(p => p.filter(s => !selectedSheetIds.includes(s.id))); setSelectedSheetIds([]); }} className="h-10 px-3 bg-red-100 text-red-700 rounded-lg font-bold text-xs border border-red-200 flex items-center justify-center">
                     <Trash2 size={16}/>
                  </button>
               </div>
             ) : (
               <div className="w-full py-1 font-medium flex flex-col items-center">
                 <div className="text-xs text-gray-400 flex flex-col items-center mb-1">
                    <span className="flex items-center gap-1"><MousePointer2 size={16} className="opacity-50"/> Натисніть на лист(и) для редагування</span>
                    <span className="text-[10px] mt-1 opacity-70">Підказка: Виділені листи можна рухати кнопками та стрілками</span>
                 </div>
                 <div className="flex gap-2 mt-1">
                     <button onClick={() => setIsMultiSelect(!isMultiSelect)} className={`px-4 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-2 transition ${isMultiSelect ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                         <Layers size={14}/> Мульти-вибір
                     </button>
                     <button onClick={() => setSelectedSheetIds(sheets.map(s => s.id))} className="px-4 py-1.5 border bg-gray-100 text-gray-600 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-gray-200">
                         <Copy size={14}/> Виділити всі
                     </button>
                 </div>
               </div>
             )
         )}
      </div>

      {/* PDF PREVIEW IFRAME OVERLAY */}
      {previewHtml && (
          <div className="absolute inset-0 z-[100] bg-white">
              <iframe
                  srcDoc={previewHtml}
                  className="absolute inset-0 w-full h-full border-none"
                  title="PDF Preview"
                  allow="web-share"
              />
          </div>
      )}
    </div>
  );
}
