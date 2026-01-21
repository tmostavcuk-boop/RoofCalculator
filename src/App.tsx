import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, Maximize, LayoutGrid, 
  PlusCircle, Trash2, ArrowRight, Undo, 
  Settings, Calculator,
  MousePointer2, ChevronRight, Focus, Grid3X3, Columns, AlignJustify, MoreHorizontal,
  Ruler, Info, Sparkles, X, Send, MessageSquare, Loader2,
  SquareDashed, Scissors, Layers, ChevronDown, ChevronUp, FileText,
  MinusSquare, Move, TrendingUp, TrendingDown, Minus, ArrowUpDown, Crosshair,
  Plus, Download, ArrowUp, ArrowDown, ArrowLeft, LayoutTemplate,
  Copy, Edit2, Check, Split
} from 'lucide-react';

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
  verticalGuides: number[]; // X-coordinates for vertical splits
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
  { id: 'l', name: 'Г-подібний', points: [{x:-2000,y:0}, {x:-2000,y:4000}, {x:0,y:4000}, {x:0,y:2000}, {x:2000,y:2000}, {x:2000,y:0}] },
  { id: 'u', name: 'П-подібний', points: [{x:-2500,y:0}, {x:-2500,y:4000}, {x:-1000,y:4000}, {x:-1000,y:2000}, {x:1000,y:2000}, {x:1000,y:4000}, {x:2500,y:4000}, {x:2500,y:0}] },
  { id: 't', name: 'Т-подібний', points: [{x:-500,y:4000}, {x:500,y:4000}, {x:500,y:2500}, {x:2500,y:2500}, {x:2500,y:1500}, {x:500,y:1500}, {x:500,y:0}, {x:-500,y:0}] },
  { id: 'z', name: 'Z-подібний', points: [{x:-2500,y:2500}, {x:0,y:2500}, {x:0,y:4000}, {x:2500,y:4000}, {x:2500,y:1500}, {x:0,y:1500}, {x:0,y:0}, {x:-2500,y:0}] },
  { id: 'rhomb', name: 'Ромб', points: [{x:0,y:0}, {x:1500,y:2500}, {x:0,y:5000}, {x:-1500,y:2500}] },
];

// --- Components ---
const GridBackground = React.memo(() => (
  <pattern id="grid" width="1000" height="1000" patternUnits="userSpaceOnUse" x="0" y="0">
    <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="#94A3B8" strokeWidth="1" strokeOpacity="0.3"/>
  </pattern>
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
  
  // --- MULTI-SLOPE STATE ---
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

  // Derived Active State Helpers
  const activeSlopeIndex = useMemo(() => slopes.findIndex(s => s.id === activeSlopeId), [slopes, activeSlopeId]);
  const activeSlope = slopes[activeSlopeIndex];

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
  }, [activeSlopeId]);

  // Compatibility Wrappers for existing logic
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

  // Selection States
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
  
  // UI States
  const [uiScale, setUiScale] = useState(1);
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false); 

  // AI State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ x: 0, y: 0, scale: 0.05 });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const selectedSheet = useMemo(() => sheets.find(s => s.id === selectedSheetId), [sheets, selectedSheetId]);

  // --- Helpers ---
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

  // Stats for ACTIVE slope
  const polygonArea = useMemo(() => {
    const outer = getPolyArea(vertices);
    const inner = holes.reduce((acc, h) => acc + getPolyArea(h), 0);
    return Math.max(0, outer - inner);
  }, [vertices, holes]);

  const sheetsArea = useMemo(() => {
      return sheets.reduce((acc, s) => acc + (s.width * s.length / 1000000), 0);
  }, [sheets]);

  const wastePercentage = polygonArea > 0 ? ((sheetsArea - polygonArea) / sheetsArea * 100) : 0;

  // Global Stats
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

  // --- PDF Export Logic ---
  const handleExportPdf = () => {
    const date = new Date().toLocaleDateString('uk-UA');
    const isPicket = material.type === 'picket';
    const isSiding = material.type === 'siding';
    
    const generateSlopeSvg = (slope: RoofSlope) => {
        const allPoints = [...slope.vertices, ...slope.holes.flat()].map(toSvg);
        if (allPoints.length === 0) return "";
        
        const minX = Math.min(...allPoints.map(p => p.x));
        const maxX = Math.max(...allPoints.map(p => p.x));
        const minY = Math.min(...allPoints.map(p => p.y));
        const maxY = Math.max(...allPoints.map(p => p.y));
        const width = maxX - minX;
        const height = maxY - minY;
        const pX = width * 0.1;
        const pY = height * 0.1;
        const viewBox = `${minX - pX} ${minY - pY} ${width + pX * 2} ${height + pY * 2}`;
        
        const bgPath = `M ${slope.vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z ${slope.holes.map(h => `M ${h.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`).join(' ')}`;
        
        const sheetsSvg = slope.sheets.map(sheet => {
            // FIX: Корегуємо позицію Y, щоб лист малювався від верхньої точки (в SVG координатах) вниз
            const pos = toSvg({x: sheet.x, y: sheet.y + sheet.length});
            const strokeW = isSiding ? 2 : 5;
            const fontSize = isSiding ? sheet.length * 0.35 : Math.max(120, sheet.width/8);
            const textY = sheet.length/2 + (isSiding ? sheet.length * 0.12 : 0);
            return `
                <g transform="translate(${pos.x}, ${pos.y})">
                    <rect width="${sheet.width}" height="${sheet.length}" fill="${sheet.color}" fill-opacity="0.15" stroke="#EF4444" stroke-width="${strokeW}" stroke-dasharray="20,10" />
                    <text x="${sheet.width/2}" y="${textY}" fill="#991B1B" font-size="${fontSize}" text-anchor="middle" font-weight="bold" font-family="sans-serif">${sheet.label}</text>
                </g>
            `;
        }).join('');
        
        const outlinePath = `M ${slope.vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`;
        const holesSvg = slope.holes.map(h => `
             <path d="M ${h.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z" fill="rgba(239, 68, 68, 0.1)" stroke="#EF4444" stroke-width="10" stroke-dasharray="15,15" />
        `).join('');

        const guidesSvg = (slope.verticalGuides || []).map(gx => {
             const gSvg = toSvg({x: gx, y: 0}); 
             return `<line x1="${gSvg.x}" y1="${minY - pY}" x2="${gSvg.x}" y2="${maxY + pY}" stroke="#2563EB" stroke-width="5" stroke-dasharray="20,10"/>`;
        }).join('');

        // NO CLIP PATH for sheets in PDF anymore
        return `<svg viewBox="${viewBox}" style="width:100%; height:100%;" preserveAspectRatio="xMidYMid meet">
            <path d="${bgPath}" fill="#F1F5F9" stroke="none" fill-rule="evenodd" />
            
            ${sheetsSvg}
            
            <path d="${outlinePath}" fill="none" stroke="#2563EB" stroke-width="8" />
            ${holesSvg}
            ${guidesSvg}
        </svg>`;
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Будь ласка, дозвольте спливаючі вікна для збереження PDF.");
        return;
    }

    let slopeSections = slopes.map((s, idx) => {
        const svg = generateSlopeSvg(s);
        const groups = getSheetGroups(s.sheets);
        const sArea = getPolyArea(s.vertices) - s.holes.reduce((acc, h) => acc + getPolyArea(h), 0);
        
        return `
        <div class="page-break">
            <div class="section-title">${s.name} (Площа: ${sArea.toFixed(2)} м²)</div>
            <div class="svg-container">${svg}</div>
            <table>
                <thead>
                    <tr><th>№</th><th>${isPicket ? 'Довжина (см)' : 'Довжина (мм)'}</th><th>Кількість (шт)</th><th>Метраж (м.п.)</th></tr>
                </thead>
                <tbody>
                    ${groups.map(([len, count], i) => `
                        <tr>
                            <td>${i + 1}</td><td><strong>${isPicket ? Math.round(Number(len)/10) : len}</strong></td><td>${count}</td>
                            <td>${((Number(len) * count) / 1000).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }).join('');

    const globalGroups: Record<number, number> = {};
    slopes.forEach(s => {
        s.sheets.forEach(sh => {
            globalGroups[sh.label] = (globalGroups[sh.label] || 0) + 1;
        });
    });
    const sortedGlobal = Object.entries(globalGroups).sort((a,b) => Number(b[0]) - Number(a[0]));
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <title>Карта Розкрою - ${material.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1f2937; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563EB; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { margin: 0; color: #111827; font-size: 24px; }
          .sub-title { color: #6B7280; margin: 5px 0 0 0; font-size: 14px; }
          .meta-box { text-align: right; font-size: 14px; color: #4B5563; }
          .grid-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
          .stat-card { background: #F3F4F6; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #E5E7EB; }
          .stat-label { display: block; font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; font-weight: 600; }
          .stat-value { font-size: 18px; font-weight: 700; color: #111827; }
          .section-title { font-size: 16px; font-weight: 700; margin: 30px 0 15px 0; border-left: 4px solid #2563EB; padding-left: 10px; color: #1F2937; page-break-after: avoid; }
          .svg-container { width: 100%; height: 350px; border: 1px solid #E5E7EB; margin-bottom: 20px; display: flex; justify-content: center; align-items: center; border-radius: 8px; overflow: hidden; background: white; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; page-break-inside: avoid; }
          th { background: #F9FAFB; color: #374151; font-weight: 600; text-align: left; padding: 10px; border-bottom: 2px solid #E5E7EB; }
          td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; color: #4B5563; }
          .total-row td { background: #EEF2FF; font-weight: 700; color: #1E40AF; border-top: 2px solid #2563EB; }
          .page-break { page-break-inside: avoid; margin-bottom: 40px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Специфікація Покрівлі</h1>
            <p class="sub-title">Згенеровано Roof Master Pro</p>
          </div>
          <div class="meta-box">
            <div><strong>Дата:</strong> ${date}</div>
            <div><strong>Матеріал:</strong> ${material.name}</div>
            <div style="font-size: 12px; color: #9CA3AF; margin-top:2px;">
              ${material.totalWidth}мм / ${material.effectiveWidth}мм
            </div>
          </div>
        </div>

        <div class="grid-stats">
          <div class="stat-card">
            <span class="stat-label">Загальна площа</span>
            <span class="stat-value">${totalProjectStats.totalArea.toFixed(2)} м²</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Площа листів</span>
            <span class="stat-value">${totalProjectStats.totalSheetsArea.toFixed(2)} м²</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">К-сть листів</span>
            <span class="stat-value">${totalProjectStats.totalSheetsCount} шт</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Відходи</span>
            <span class="stat-value" style="color: ${totalProjectStats.totalWaste > 15 ? '#DC2626' : '#059669'}">${totalProjectStats.totalWaste.toFixed(1)}%</span>
          </div>
        </div>

        <div class="section-title">ЗВЕДЕНА СПЕЦИФІКАЦІЯ (ВСІ СХИЛИ)</div>
        <table>
            <thead>
            <tr>
              <th>№</th>
              <th>${isPicket ? 'Довжина (см)' : 'Довжина (мм)'}</th>
              <th>Кількість (шт)</th>
              <th>Загальний метраж (м.п.)</th>
            </tr>
          </thead>
          <tbody>
            ${sortedGlobal.map(([len, count], index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${isPicket ? Math.round(Number(len)/10) : len}</strong></td>
                <td>${count}</td>
                <td>${((Number(len) * count) / 1000).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
             <tr class="total-row">
                <td colspan="2">РАЗОМ</td>
                <td>${totalProjectStats.totalSheetsCount}</td>
                <td>${(slopes.reduce((acc, s) => acc + s.sheets.reduce((a, sh) => a + sh.length, 0), 0) / 1000).toFixed(2)} м.п.</td>
             </tr>
          </tfoot>
        </table>

        ${slopeSections}

        <script>
          window.onload = () => { setTimeout(() => { window.print(); }, 500); };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
  };

  // --- AI Logic ---
  const getProjectContext = () => {
    return `
      Ти експерт-покрівельник у додатку Roof Master.
      Поточний проект (Схилів: ${slopes.length}):
      - Матеріал: ${material.name}
      - Загальна площа: ${totalProjectStats.totalArea.toFixed(2)} м²
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

  const handleAddGuideManual = () => {
    const val = Number(newGuideX);
    if (!isNaN(val)) {
        setVerticalGuides(prev => [...prev, val]);
        const newIndex = verticalGuides.length; 
        setSelectedGuideIndex(newIndex);
        setIsAddingGuide(false);
        setNewGuideX("");
    }
  };

  const handlePointerDown = (e: React.PointerEvent, type: 'bg' | 'vertex' | 'hole-move' | 'sheet' | 'guide', id?: any) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    
    if (type !== 'bg') e.stopPropagation();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const { x, y } = getPointerPos(e);
    
    if (isAddingGuide && type === 'bg') {
        // Add vertical guide immediately on click
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const scale = transform.current.scale;
            const svgX = (x - rect.left) / scale - transform.current.x / scale;
            
            // Auto-select the new guide for immediate editing
            const newIndex = verticalGuides.length;
            setSelectedGuideIndex(newIndex);
            
            setVerticalGuides(prev => [...prev, svgX]);
            setIsAddingGuide(false);
            return;
        }
    }

    lastPos.current = { x, y };
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
      setSelectedSheetId(id);
      isDragging.current = false; 
    } else if (type === 'guide') {
      setSelectedGuideIndex(id);
      isDragging.current = false; 
    } else {
      setActiveElement(null);
      setSelectedSheetId(null);
      setSelectedEdge(null);
      setSelectedHoleIndex(null);
      setIsEditingHeight(false);
      setSelectedVertex(null); 
      setSelectedGuideIndex(null);
      setIsAddingGuide(false);
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
                next[vertIndex] = { x: next[vertIndex].x + dx / scale, y: next[vertIndex].y + dy / scale };
            }
            return next;
          });
      } else {
          setHoles(prev => {
              const nextHoles = [...prev];
              let nextPoly = [...nextHoles[polyIndex]];
              if (vertIndex === -1) {
                  nextPoly = nextPoly.map(p => ({ x: p.x + dx / scale, y: p.y + dy / scale }));
              } else {
                  if (nextPoly[vertIndex]) {
                      nextPoly[vertIndex] = { x: nextPoly[vertIndex].x + dx / scale, y: nextPoly[vertIndex].y + dy / scale };
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
      const { polyIndex, vertIndex } = selectedVertex;
      if (polyIndex === -1) {
          setVertices(prev => {
              const next = [...prev];
              next[vertIndex] = { ...next[vertIndex], [axis]: val };
              return next;
          });
      } else {
          setHoles(prev => {
              const next = [...prev];
              const poly = [...next[polyIndex]];
              poly[vertIndex] = { ...poly[vertIndex], [axis]: val };
              next[polyIndex] = poly;
              return next;
          });
      }
  };

  // --- Logic Functions ---
  const moveLayout = (dx: number, dy: number) => {
    setLayoutOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const updateEdgeLength = (newLength: number) => {
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

        if (polyIndex === -1 && points.length === 4) {
             if (p2.y < p1.y) { 
                 const dx = p1.x - p2.x; const dy = p1.y - p2.y;
                 newPoints[i1] = { x: p2.x + dx * ratio, y: p2.y + dy * ratio };
             } else {
                 const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                 newPoints[i2] = { x: p1.x + dx * ratio, y: p1.y + dy * ratio };
             }
             return newPoints;
        }

        if (p2.y < p1.y) { 
             const dx = p1.x - p2.x;
             const dy = p1.y - p2.y;
             newPoints[i1] = { x: p2.x + dx * ratio, y: p2.y + dy * ratio };
        } else {
             const dx = p2.x - p1.x;
             const dy = p2.y - p1.y;
             newPoints[i2] = { x: p1.x + dx * ratio, y: p1.y + dy * ratio };
        }
        return newPoints;
    };

    if (polyIndex === -1) {
        setVertices(prev => applyChange(prev));
    } else {
        setHoles(prev => {
            const next = [...prev];
            next[polyIndex] = applyChange(next[polyIndex]);
            return next;
        });
    }
  };

  const updateHeight = (newH: number) => {
    const ys = vertices.map(p => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const currentH = maxY - minY;
    if (currentH < 1 || newH < 1) return;
    const scale = newH / currentH;
    setVertices(prev => prev.map(p => ({ ...p, y: minY + (p.y - minY) * scale })));
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
      // 1. Базові лінії сканування (з невеликим відступом всередину)
      let scanLines = [minVal + 1, maxVal - 1, (minVal + maxVal) / 2];
      
      // 2. Додаємо всі вершини, що потрапляють всередину діапазону (для точного визначення ширини складних фігур)
      const allPolys = [vertices, ...holes];
      allPolys.forEach(poly => {
          poly.forEach(p => {
              const val = isVertical ? p.x : p.y;
              // Fix: Враховуємо вершини, що лежать точно на межах ряду (>= та <=)
              if (val >= minVal && val <= maxVal) {
                  scanLines.push(val);
              }
          });
      });

      // Сортуємо та прибираємо дублікати
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
          // Об'єднуємо сегменти, якщо вони перетинаються або торкаються (<= замість <)
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
    // Only calculate for ACTIVE slope
    const minX = Math.min(...vertices.map(p => p.x));
    const maxX = Math.max(...vertices.map(p => p.x));
    const minY = Math.min(...vertices.map(p => p.y));
    const maxY = Math.max(...vertices.map(p => p.y));

    const newSheets: Sheet[] = [];
    const maxLength = material.maxLength || 6000;
    const overlap = material.overlap || 0;
    const isTile = material.type === 'tile';
    const tileWave = 350;
    
    const fixTileLength = (len: number) => {
        let fixed = len;
        if (fixed < 450) fixed = 450;
        const rem = fixed % tileWave;
        if (rem >= 0 && rem < 90) fixed += (90 - rem + 5); 
        return fixed;
    };

    if (material.type === 'siding') {
        // --- SIDING: Horizontal Strips ---
        const gridOriginY = maxY + layoutOffset.y; 
        const startRow = 0;
        // Calculate needed rows to cover full height from minY to maxY
        const totalHeight = maxY - minY;
        const endRow = Math.ceil(totalHeight / material.effectiveWidth) + 2; 

        for (let i = startRow; i <= endRow; i++) {
             // Calculate strip boundaries (going UP from bottom, physically)
             // Visual: Siding is usually installed from bottom up
             const stripBottom = gridOriginY - i * material.effectiveWidth;
             const stripTop = stripBottom - material.effectiveWidth;
             
             // Check if this horizontal strip intersects with the bounding box of the roof
             if (stripBottom < minY && stripTop < minY) continue; 
             if (stripTop > maxY && stripBottom > maxY) continue;

             // Find horizontal segments where roof exists in this strip
             const segments = getMergedSegments(stripTop, stripBottom, false); // false = horizontal intersection scan
             
             const panelOriginX = minX + layoutOffset.x;
             // Siding step is horizontal. 
             // stepX defines where the NEXT panel starts. 
             // Ideally stepX = maxLength - overlap.
             const stepX = maxLength - overlap;

             segments.forEach(([xMin, xMax]) => {
                 // xMin and xMax are the absolute X boundaries of the roof shape at this Y level.
                 // We need to cover the range [xMin, xMax].

                 // Calculate index of the first potential panel that could cover xMin
                 const startM = Math.floor((xMin - panelOriginX) / stepX);
                 
                 // Estimate how many panels we need to cover the width
                 const count = Math.ceil((xMax - xMin) / stepX) + 2;

                 for (let offset = 0; offset < count; offset++) {
                     const m = startM + offset;
                     
                     // Theoretical panel coordinates (if it were a full infinite grid)
                     const theoLeft = panelOriginX + m * stepX;
                     const theoRight = theoLeft + maxLength;

                     // Calculate the INTERSECTION of the theoretical panel with the actual roof segment.
                     // This determines the physical piece we need to cut/install.
                     const visibleLeft = Math.max(theoLeft, xMin);
                     const visibleRight = Math.min(theoRight, xMax);
                     
                     const visibleWidth = visibleRight - visibleLeft;

                     // If this panel is completely outside the roof segment, skip it
                     if (visibleWidth <= 1) continue;

                     // Specification Logic:
                     // The 'label' should reflect the cut length. 
                     // visibleWidth is exactly the length of the piece needed to cover the area from visibleLeft to visibleRight.
                     // (Taking into account that overlap is handled by the positioning of adjacent panels via stepX).
                     
                     newSheets.push({
                         id: `s-${i}-${m}`,
                         x: visibleLeft,
                         y: stripTop, // Visual position
                         width: Math.round(visibleWidth), 
                         length: material.totalWidth, // Height of panel
                         label: Math.round(visibleWidth), // Real cut length for spec
                         fullLength: Math.round(visibleWidth),
                         color: COLORS[Math.abs(i) % COLORS.length],
                         row: i
                     });
                 }
             });
        }
    } else {
        // --- TILE, PROFILE & PICKET: Vertical Strips ---
        const gridOriginX = minX + layoutOffset.x;
        // Determine column range to cover minX to maxX
        const startK = Math.floor((minX - gridOriginX) / material.effectiveWidth);
        const endK = Math.floor((maxX - gridOriginX) / material.effectiveWidth) + 1;
        
        let stepY = maxLength - overlap;
        if (isTile) {
            const waveCount = Math.floor(stepY / tileWave);
            if (waveCount > 0) stepY = waveCount * tileWave;
        }

        // PICKET CALCULATION HELPERS
        const slopeWidth = maxX - minX;
        const centerX = minX + slopeWidth / 2;
        const halfWidth = slopeWidth / 2; // Maximum distance from center

        for (let i = startK; i <= endK; i++) {
           const stripLeft = gridOriginX + i * material.effectiveWidth;
           const stripRight = stripLeft + material.effectiveWidth;
           const stripCenter = stripLeft + material.effectiveWidth / 2; // Center of current picket/sheet
           
           // Find vertical segments where roof exists in this vertical strip
           const segments = getMergedSegments(stripLeft, stripRight, true); // true = vertical intersection scan

           segments.forEach(([yMin, yMax]) => {
                // yMin = bottom-most point of roof segment in this strip
                // yMax = top-most point
                
                // We need to cover from yMin to yMax
                // Sheets usually start from bottom (yMin) and go up
                // Start sheet alignment from yMin
                
                // Calculate number of sheets needed
                const totalLen = yMax - yMin;
                if (totalLen <= 0) return;

                // Calculate sheet positions
                let currentY = yMin; // Start from bottom
                let sheetIndex = 0;

                while (currentY < yMax) {
                    let neededLen = maxLength; // Default to max length
                    
                    // If this is the last sheet or only sheet
                    if (currentY + neededLen >= yMax) {
                        neededLen = yMax - currentY;
                    }
                    
                    // Visual adjustments for Tile
                    let visualLen = neededLen;
                    let orderedLen = neededLen;
                    
                    if (isTile) {
                         // Logic for tile wave snapping
                         if (currentY + maxLength < yMax) {
                             // Middle sheet
                             orderedLen = stepY + overlap;
                             visualLen = stepY + overlap;
                         } else {
                             // Top sheet
                             // Add overlap to required physical length if it's not the first sheet
                             let physicalNeeded = neededLen;
                             if (sheetIndex > 0) physicalNeeded += overlap;
                             
                             orderedLen = fixTileLength(physicalNeeded);
                             visualLen = neededLen; 
                         }
                    } else if (material.type === 'picket') {
                        // --- PICKET ARCH LOGIC ---
                        const availableHeight = totalLen;
                        // Fix: Використовуємо реальну висоту секції як базу, якщо вона менша за налаштування макс. довжини.
                        // Це запобігає ситуації, коли арка "зрізається" плоскою лінією верху секції.
                        let peakHeight = Math.min(material.maxLength, availableHeight);
                        
                        let picketH = peakHeight; // Default to peak

                        if (material.picketProfile && material.picketProfile !== 'straight') {
                            const dist = Math.abs(stripCenter - centerX); // Distance from center
                            const archH = material.archHeight || 0;
                            // Parabola coefficient: k = deltaH / (maxDist^2)
                            const k = halfWidth > 0 ? archH / (halfWidth * halfWidth) : 0;
                            
                            if (material.picketProfile === 'convex') {
                                // Hill: H(x) = H_max - k * x^2
                                // Center is highest
                                picketH = peakHeight - k * dist * dist;
                            } else if (material.picketProfile === 'concave') {
                                // Valley: H(x) = H_min + k * x^2
                                // Center is lowest (H_min = H_max - archH)
                                const hMin = peakHeight - archH;
                                picketH = hMin + k * dist * dist;
                            }
                        }

                        // Round to nearest 10mm
                        picketH = Math.round(picketH / 10) * 10;
                        
                        // Clip to geometric limits (can't be taller than the drawn box)
                        if (picketH > availableHeight) picketH = Math.floor(availableHeight / 10) * 10;
                        if (picketH < 0) picketH = 0;

                        orderedLen = picketH;
                        visualLen = picketH;
                    } else {
                        // Profile
                        if (currentY + maxLength < yMax) {
                            // Full sheet in middle
                            visualLen = maxLength;
                            orderedLen = maxLength;
                        } else {
                            // Top sheet
                             let physicalNeeded = neededLen;
                             if (sheetIndex > 0) physicalNeeded += overlap;
                             orderedLen = physicalNeeded;
                             visualLen = neededLen;
                        }
                    }

                    if (visualLen > 10) {
                        // For Picket: Y position is fixed at bottom
                        let displayY = currentY;
                        if (material.type === 'picket') {
                             // Pickets sit on the bottom line (yMin)
                             displayY = yMin;
                        }

                         newSheets.push({
                            id: `s-${i}-${sheetIndex}-${currentY.toFixed(0)}`,
                            x: stripLeft,
                            y: displayY, // Position from bottom
                            width: material.totalWidth,
                            length: Math.round(visualLen), // Visual height
                            label: Math.round(orderedLen),
                            fullLength: Math.round(orderedLen),
                            color: COLORS[Math.abs(sheetIndex) % COLORS.length],
                            row: sheetIndex
                        });
                    }

                    // Move up for next sheet
                    if (isTile) {
                        currentY += stepY;
                    } else if (material.type === 'picket') {
                        currentY += 999999; // One picket per vertical slot
                    } else {
                        currentY += (maxLength - overlap);
                    }
                    sheetIndex++;
                }
           });
        }
    }
    setSheets(newSheets);
  }, [vertices, holes, material, layoutOffset, verticalGuides]);

  useEffect(() => {
      if (step === 'layout') {
          calculateLayout();
      }
  }, [layoutOffset, step, activeSlopeId, verticalGuides]); 

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
          vertices: [{ x: -2000, y: 0 }, { x: -2000, y: 3000 }, { x: 2000, y: 3000 }, { x: 2000, y: 0 }],
          holes: [],
          verticalGuides: [],
          sheets: [],
          layoutOffset: { x: 0, y: 0 }
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
      if (selectedGuideIndex !== null) {
          setVerticalGuides(prev => prev.filter((_, i) => i !== selectedGuideIndex));
          setSelectedGuideIndex(null);
          return;
      }
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
      const newHole = [{x:cx-size/2,y:cy-size/2},{x:cx+size/2,y:cy-size/2},{x:cx+size/2,y:cy+size/2},{x:cx-size/2,y:cy+size/2}];
      setHoles([...holes, newHole]);
      setSelectedHoleIndex(holes.length);
  };

  const updatePicketGap = (newGap: number) => setMaterial(prev => ({ ...prev, gap: newGap, effectiveWidth: prev.totalWidth + newGap }));
  const updatePicketWidth = (newWidth: number) => setMaterial(prev => ({ ...prev, totalWidth: newWidth, effectiveWidth: newWidth + (prev.gap || 0) }));

  const pointRadius = Math.max(50, 10 / uiScale);

  // Helper for clipPath
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
                 onClick={() => setMaterial(m)} 
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
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Ширина (см)</label>
                            <input type="number" value={material.totalWidth / 10} onChange={(e) => updatePicketWidth(+e.target.value * 10)} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Зазор (см)</label>
                            <input type="number" value={(material.gap || 0) / 10} onChange={(e) => updatePicketGap(+e.target.value * 10)} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                        </div>
                        <div className="col-span-2">
                             <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Макс висота (см)</label>
                             <input type="number" value={material.maxLength / 10} onChange={(e) => setMaterial(prev => ({...prev, maxLength: +e.target.value * 10}))} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                        </div>
                    </div>
                    
                    <div className="pt-2 border-t mt-2">
                         <label className="text-[10px] text-gray-500 font-bold uppercase block mb-2">Шаблон верху</label>
                         <div className="grid grid-cols-3 gap-2 mb-3">
                            <button onClick={() => setMaterial(prev => ({...prev, picketProfile: 'straight'}))} className={`p-2 rounded border flex flex-col items-center gap-1 ${material.picketProfile === 'straight' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200'}`}>
                                <Minus size={16}/>
                                <span className="text-[10px] font-bold">Прямий</span>
                            </button>
                            <button onClick={() => setMaterial(prev => ({...prev, picketProfile: 'convex'}))} className={`p-2 rounded border flex flex-col items-center gap-1 ${material.picketProfile === 'convex' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200'}`}>
                                <TrendingUp size={16}/>
                                <span className="text-[10px] font-bold">Арка</span>
                            </button>
                            <button onClick={() => setMaterial(prev => ({...prev, picketProfile: 'concave'}))} className={`p-2 rounded border flex flex-col items-center gap-1 ${material.picketProfile === 'concave' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200'}`}>
                                <TrendingDown size={16}/>
                                <span className="text-[10px] font-bold">Сідло</span>
                            </button>
                         </div>
                         
                         {material.picketProfile !== 'straight' && (
                             <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Глибина арки (см)</label>
                                <input type="number" value={(material.archHeight || 0) / 10} onChange={(e) => setMaterial(prev => ({...prev, archHeight: +e.target.value * 10}))} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                             </div>
                         )}
                    </div>

                    <div className="col-span-2 bg-blue-50 p-2 rounded text-xs text-blue-700 flex items-center gap-2 mt-2">
                        <Info size={14}/>
                        <span>Крок монтажу (ширина + зазор): <b>{(material.effectiveWidth / 10).toFixed(1)} см</b></span>
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
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                             <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Макс довжина (мм)</label>
                                <input type="number" value={material.maxLength} onChange={(e) => setMaterial({...material, maxLength: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                             </div>
                             <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Нахлест по довжині</label>
                                <input type="number" value={material.overlap || 0} onChange={(e) => setMaterial({...material, overlap: +e.target.value})} className="w-full border rounded-lg p-2 text-lg font-bold bg-gray-50"/>
                             </div>
                        </div>
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

  // ... (The rest of the render block remains the same as previous) ...
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
                {ROOF_TEMPLATES.map(tmpl => (
                    <button key={tmpl.id} onClick={() => applyTemplate(tmpl.points)} className="flex flex-col items-center gap-2 p-3 border rounded-xl hover:border-blue-500 hover:bg-blue-50 transition">
                        <div className="w-24 h-24 bg-white border rounded flex items-center justify-center"><LayoutTemplate size={32} className="text-gray-300"/></div>
                        <span className="text-xs font-bold text-center">{tmpl.name}</span>
                    </button>
                ))}
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
                            <Undo size={14}/>
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
                                <button onClick={(e) => { e.stopPropagation(); startRenameSlope(); }} className="p-0.5 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-600">
                                    <Edit2 size={10}/>
                                </button>
                             )}
                         </span>
                     )}
                     
                     {slopes.length > 1 && (
                         <button onClick={(e) => removeSlope(e, slope.id)} className="p-0.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500">
                             <X size={12}/>
                         </button>
                     )}
                 </div>
             ))}
             <button onClick={addSlope} className="px-2 py-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
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
                                    <SquareDashed size={16}/>
                                    <span className="text-xs">Площа</span>
                                </div>
                                <span className="text-xs font-bold">{polygonArea.toFixed(2)} м²</span>
                            </div>

                            {step === 'layout' && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            <LayoutGrid size={16}/>
                                            <span className="text-xs">Площа листів</span>
                                        </div>
                                        <span className="text-xs font-bold">{sheetsArea.toFixed(2)} м²</span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            <Scissors size={16}/>
                                            <span className="text-xs">Відходи</span>
                                        </div>
                                        <span className={`text-xs font-bold ${wastePercentage > 15 ? 'text-red-500' : 'text-green-600'}`}>
                                            {wastePercentage.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            <Layers size={16}/>
                                            <span className="text-xs">Листів</span>
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
                        {/* TOTAL STATS SUMMARY */}
                        <div className="mt-2 pt-2 border-t border-gray-200">
                             <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Загалом по проекту</div>
                             <div className="flex justify-between items-center text-xs">
                                 <span>Площа:</span>
                                 <span className="font-bold">{totalProjectStats.totalArea.toFixed(1)} м²</span>
                             </div>
                             <div className="flex justify-between items-center text-xs">
                                 <span>Листів:</span>
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
            {/* FORCE RECENTER BUTTON & ZOOM CONTROLS */}
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

            <div ref={canvasRef} style={{ transformOrigin: '0 0', willChange: 'transform' }}>
              <svg style={{ overflow: 'visible' }}>
                  <defs>
                      <GridBackground />
                      <clipPath id="slope-clip">
                          <path d={slopePath} clipRule="evenodd" />
                      </clipPath>
                  </defs>
                  <rect x="-200000" y="-200000" width="400000" height="400000" fill="url(#grid)" />
                  
                  {/* --- AXES (Visual Guides) --- */}
                  <line x1="-200000" y1="0" x2="200000" y2="0" stroke="#EF4444" strokeWidth="3" strokeOpacity="0.5" /> {/* X-Axis (Red) */}
                  <line x1="0" y1="-200000" x2="0" y2="200000" stroke="#10B981" strokeWidth="3" strokeOpacity="0.5" /> {/* Y-Axis (Green) */}

                  {/* --- 1. Background Fill (Bottom Layer) --- */}
                  <path 
                    d={slopePath}
                    fill="#94A3B8" stroke="none" fillRule="evenodd" opacity="0.5"
                  />
                  
                  {/* --- 2. Sheets (Middle Layer) --- */}
                  {/* REMOVED CLIP PATH: Sheets now display as full rectangles overlapping the roof shape */}
                  <g>
                    {step === 'layout' && sheets.map(sheet => {
                        // FIX: Аналогічне виправлення для відображення на екрані
                        const svgPos = toSvg({x: sheet.x, y: sheet.y + sheet.length});
                        const isSiding = material.type === 'siding';
                        // Siding specific visual adjustments
                        const strokeW = selectedSheetId === sheet.id ? 25 : (isSiding ? 2 : 5);
                        const fontSize = isSiding ? sheet.length * 0.35 : Math.max(120, sheet.width/8);
                        const textY = sheet.length/2 + (isSiding ? sheet.length * 0.12 : 0);

                        return (
                            <g key={sheet.id} transform={`translate(${svgPos.x}, ${svgPos.y})`}
                              onPointerDown={(e) => handlePointerDown(e, 'sheet', sheet.id)}
                            >
                              <rect 
                                width={sheet.width} 
                                height={sheet.length} 
                                fill={sheet.color} 
                                fillOpacity={0.15}
                                stroke={selectedSheetId === sheet.id ? '#F97316' : '#EF4444'} 
                                strokeWidth={strokeW} 
                                strokeDasharray={selectedSheetId === sheet.id ? 'none' : '20,10'}
                              />
                              <text 
                                x={sheet.width/2} 
                                y={textY} 
                                fill={selectedSheetId === sheet.id ? '#F97316' : '#991B1B'}
                                fontSize={fontSize} 
                                textAnchor="middle" 
                                fontWeight="bold" 
                                className="pointer-events-none"
                              >
                                {sheet.label}
                              </text>
                            </g>
                        )
                    })}
                  </g>
                  
                  {/* --- 3. Outlines and Highlights (Top Layer) --- */}
                  {/* Outer Stroke - Thin on top - BLUE */}
                  <path 
                    d={`M ${vertices.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`}
                    fill="none" stroke="#2563EB" strokeWidth="5" vectorEffect="non-scaling-stroke"
                  />
                  
                  {/* Holes Stroke & Fill (RED) */}
                  {holes.map((hole, hi) => (
                    <g key={`hg-${hi}`}>
                      <path 
                        d={`M ${hole.map(toSvg).map(p => `${p.x} ${p.y}`).join(' L ')} Z`}
                        fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeWidth="4" strokeDasharray="10,10" vectorEffect="non-scaling-stroke"
                      />
                      {/* Central Move Handle for Hole */}
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

                  {/* Vertical Guides */}
                  {step === 'geometry' && verticalGuides.map((gx, i) => {
                      const svgG = toSvg({x: gx, y: 0});
                      const isSelected = selectedGuideIndex === i;
                      // Draw infinite line (within reasonable bounds)
                      const minY = -200000;
                      const maxY = 200000;
                      return (
                          <g key={`vg-${i}`} onPointerDown={(e) => handlePointerDown(e, 'guide', i)}>
                              <line 
                                x1={svgG.x} y1={minY} 
                                x2={svgG.x} y2={maxY} 
                                stroke={isSelected ? "#F97316" : "#2563EB"} 
                                strokeWidth={isSelected ? 15 : 10} 
                                strokeDasharray="40,20"
                                className="cursor-col-resize hover:opacity-80"
                              />
                          </g>
                      );
                  })}

                  {/* Vertices (Outer) */}
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

                  {/* Hole Vertices */}
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

                  {/* Interactive Dimensions (Outer Only for simplicity) */}
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
                  
                  {/* Height Dimension (Vertical Center) - RESTORED */}
                  {step === 'geometry' && (() => {
                      // Calculations in World Space based on active slope vertices
                      const ys = vertices.map(p => p.y);
                      const minY = Math.min(...ys);
                      const maxY = Math.max(...ys);
                      const xs = vertices.map(p => p.x);
                      const minX = Math.min(...xs);
                      const maxX = Math.max(...xs);
                      const centerX = (minX + maxX) / 2;
                      const height = maxY - minY;
                      const fs = pointRadius * 1.0;
                      
                      // Convert to SVG for rendering
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
                             {/* Vertical Dashed Line */}
                             <line 
                                x1={centerX} y1={svgBottom.y} 
                                x2={centerX} y2={svgTop.y} 
                                stroke={isEditingHeight ? "#8B5CF6" : "#A78BFA"} 
                                strokeWidth="4" 
                                strokeDasharray="20,20"
                             />
                             {/* Top/Bottom Arrows */}
                             <path d={`M ${centerX} ${svgBottom.y} L ${centerX-15} ${svgBottom.y-30} L ${centerX+15} ${svgBottom.y-30} Z`} fill={isEditingHeight ? "#8B5CF6" : "#A78BFA"} />
                             <path d={`M ${centerX} ${svgTop.y} L ${centerX-15} ${svgTop.y+30} L ${centerX+15} ${svgTop.y+30} Z`} fill={isEditingHeight ? "#8B5CF6" : "#A78BFA"} />
                             
                             {/* Label Box */}
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

                  {/* Hole Dimensions */}
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
              </svg>
            </div>
          </div>
      </main>

      {/* FOOTER */}
      <div className="flex-none bg-white border-t z-50 p-2 pb-safe min-h-[70px] flex items-center relative">
         {step === 'geometry' ? (
            isAddingGuide ? (
                // ADD GUIDE MODE (Manual Input)
                <div className="flex w-full gap-2 items-center px-2">
                    <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">Новий розділювач (X):</span>
                    <input 
                        type="number" 
                        autoFocus
                        className="w-24 border-2 border-indigo-500 bg-indigo-50 rounded p-2 text-sm font-bold outline-none"
                        value={newGuideX}
                        onChange={(e) => setNewGuideX(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddGuideManual()}
                        placeholder="0"
                    />
                    <button onClick={handleAddGuideManual} className="h-10 px-4 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow hover:bg-indigo-700">
                        Додати
                    </button>
                    <div className="w-px h-6 bg-gray-300 mx-1"></div>
                    <span className="text-[10px] text-gray-500 hidden sm:inline">або клікніть на схемі</span>
                    <button onClick={() => setIsAddingGuide(false)} className="ml-auto h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs hover:bg-gray-200">
                        Скасувати
                    </button>
                </div>
            ) : selectedGuideIndex !== null ? (
               // GUIDE EDIT MODE (Updated)
               <div className="flex w-full gap-2 items-center px-2">
                   <div className="flex-1">
                       <label className="text-[10px] text-orange-600 font-bold uppercase ml-1 block flex items-center gap-1">
                           <Split size={10}/> Позиція лінії (X)
                       </label>
                       <input 
                           type="number" 
                           autoFocus
                           className="w-full border-2 border-orange-500 bg-orange-50 rounded p-2 text-sm font-bold outline-none"
                           value={Math.round(verticalGuides[selectedGuideIndex])}
                           onChange={(e) => {
                               const val = Number(e.target.value);
                               if (!isNaN(val)) {
                                   setVerticalGuides(prev => {
                                       const next = [...prev];
                                       next[selectedGuideIndex] = val;
                                       return next;
                                   });
                               }
                           }}
                       />
                   </div>
                   <button onClick={deleteElement} className="h-10 px-3 bg-red-100 text-red-700 rounded-lg font-bold text-xs mt-4 flex items-center justify-center border border-red-200">
                       <Trash2 size={16}/>
                   </button>
                   <button onClick={() => setSelectedGuideIndex(null)} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs mt-4">ОК</button>
               </div>
            ) : selectedEdge !== null ? (
               // EDGE EDIT MODE
               <div className="flex w-full gap-2 items-center px-2">
                  <div className="flex-1">
                     <label className="text-[10px] text-blue-600 font-bold uppercase ml-1 block flex items-center gap-1">
                        <Ruler size={10}/> Редагування сторони
                     </label>
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
                               updateEdgeLength(num);
                           }
                       }}
                     />
                  </div>
                  <button 
                    onClick={() => setSelectedEdge(null)} 
                    className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs mt-4"
                  >
                    ОК
                  </button>
               </div>
            ) : isEditingHeight ? (
                // HEIGHT EDIT MODE
               <div className="flex w-full gap-2 items-center px-2">
                  <div className="flex-1">
                     <label className="text-[10px] text-purple-600 font-bold uppercase ml-1 block flex items-center gap-1">
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
                    className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs mt-4"
                  >
                    ОК
                  </button>
               </div>
            ) : selectedVertex !== null ? (
                // VERTEX EDIT MODE
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
                             <button onClick={deleteElement} className="h-10 px-3 bg-red-100 text-red-700 rounded-lg font-bold text-xs mt-4 flex items-center justify-center">
                                <Trash2 size={16}/>
                             </button>
                             <button onClick={() => setSelectedVertex(null)} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs mt-4">
                                ОК
                             </button>
                           </>
                       )
                   })()}
                </div>
            ) : (
               // DEFAULT MODE
               <div className="flex w-full gap-2 overflow-x-auto no-scrollbar items-center px-1">
                  <button onClick={() => setShowTemplates(true)} className="px-3 py-2 bg-gray-100 rounded text-xs font-bold whitespace-nowrap border border-gray-200 flex items-center gap-1">
                      <LayoutTemplate size={16} className="text-gray-600"/>
                      Шаблони
                  </button>
                  <div className="h-6 w-px bg-gray-300 mx-1"></div>
                  
                  <button onClick={() => setIsAddingGuide(true)} className={`flex-1 px-3 py-2 border rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap transition ${isAddingGuide ? 'bg-indigo-600 text-white border-indigo-700 shadow-inner' : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'}`}>
                      <Split size={16}/> {isAddingGuide ? 'Вкажіть лінію' : 'Розділювач'}
                  </button>

                  <button onClick={addVertex} className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap"><PlusCircle size={16}/> {selectedHoleIndex !== null ? 'Точку' : 'Додати'}</button>
                  <button onClick={addHole} className="flex-1 px-3 py-2 bg-orange-50 text-orange-700 border border-orange-100 rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap"><MinusSquare size={16}/> Виріз</button>
                  
                  <button onClick={deleteElement} className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded text-xs font-bold flex justify-center gap-1 whitespace-nowrap"><Trash2 size={16}/> {selectedHoleIndex !== null ? 'Виріз' : 'Видалити'}</button>
               </div>
            )
         ) : (
             selectedSheet ? (
               // SHEET EDIT MODE
               <div className="flex w-full gap-2 items-center px-2">
                  <div className="flex-1">
                     <label className="text-[10px] text-gray-500 font-bold uppercase ml-1 block">
                        {material.type === 'picket' ? 'Довжина (см)' : 'Довжина (мм)'}
                     </label>
                     <input 
                       type="number" 
                       className="w-full border bg-gray-50 rounded p-2 text-sm font-bold outline-none" 
                       value={material.type === 'picket' 
                           ? (selectedSheet.length / 10).toFixed(1)
                           : (material.type === 'siding' ? selectedSheet.width : selectedSheet.length)
                       }
                       onChange={(e) => {
                           const val = Number(e.target.value);
                           const targetId = selectedSheet.id;
                           setSheets(prev => prev.map(s => {
                               if (s.id === targetId) {
                                   if (material.type === 'picket') {
                                       // Picket: input in CM, stored in MM
                                       const newLength = val * 10;
                                       const newY = s.y + s.length - newLength;
                                       return { ...s, length: newLength, y: newY, label: newLength, fullLength: newLength };
                                   } else if (material.type === 'siding') {
                                        return { ...s, width: val, label: val, fullLength: val };
                                   } else {
                                        const newY = s.y + s.length - val;
                                        return { ...s, length: val, y: newY, label: val, fullLength: val };
                                   }
                               }
                               return s;
                           }));
                       }}
                     />
                  </div>
                  <button onClick={() => { setSheets(p => p.filter(s => s.id !== selectedSheet.id)); setSelectedSheetId(null); }} className="h-10 px-4 bg-red-100 text-red-700 rounded-lg font-bold text-xs mt-4 border border-red-200">Видалити</button>
               </div>
             ) : (
               <div className="w-full text-center text-xs text-gray-400 py-1 font-medium flex flex-col items-center">
                 <MousePointer2 size={16} className="mb-1 opacity-50"/>
                 Натисніть на лист для редагування
               </div>
             )
         )}
      </div>
    </div>
  );
}
