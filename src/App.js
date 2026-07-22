import { useState, useRef, useEffect } from "react";

const PLATFORMS = ["포이즌", "크림", "기타"];
const SIZES = [200,205,210,215,220,225,230,235,240,245,250,255,260,265,270,275,280,285,290,295,300,305,310,315,320,325,330,335,340,345,350];
const CATEGORIES = ["신발", "의류", "가방", "기타"];

// ---- 업그레이드 A: 붙여넣은 텍스트에서 품번/브랜드/상품명 추정 ----
const KNOWN_BRANDS = ["나이키","아디다스","뉴발란스","아식스","반스","컨버스","조던","살로몬","크록스","언더아머","필라","리복","푸마","호카","오니츠카타이거","MLB","르꼬끄","닥터마틴","버켄스탁","On","온러닝","데상트","아크테릭스","스투시","슈프림","스톤아일랜드","구찌","프라다","샤넬","미우미우","셀린느","코치","발렌시아가","로에베","디올"];

function parsePastedProductText(text) {
  let remaining = text.replace(/\s+/g, " ").trim();
  let code = "";
  let brand = "";

  // 품번 추정: 1차로 나이키(DD1391-100)/아디다스(JI0079) 형식부터 확인
  let codeMatch = remaining.match(/\b[A-Za-z]{2,4}\d{3,6}(-\d{2,4})?\b/);
  // 1차에서 못 찾으면, 영문+숫자가 섞인 6~14자 토큰 중 "가장 긴 것"을 품번으로 간주
  // (뉴발란스 M2002RDA, 아식스 1201A789-020, 반스 VN0A4BV5, 컨버스 162050C 등 다양한 형식 포괄.
  //  가장 긴 토큰을 고르는 이유: "990v6" 같은 짧은 모델버전 표기가 오인식되는 걸 방지하기 위함)
  if (!codeMatch) {
    const genericRe = /\b(?=[A-Za-z0-9-]{6,14}\b)(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{6,14}\b/g;
    const candidates = remaining.match(genericRe) || [];
    if (candidates.length) {
      const longest = candidates.reduce((a,b) => b.length>a.length ? b : a);
      codeMatch = [longest];
    }
  }
  if (codeMatch) {
    code = codeMatch[0];
    remaining = remaining.replace(codeMatch[0], "").trim();
  }

  // 3차: 그래도 못 찾으면 순수 숫자(5~8자리) 중 가장 긴 것을 품번으로 간주 (구찌 등 명품 대응)
  // 신발 사이즈(보통 2~3자리)보다 길게 최소 자릿수를 잡아서 사이즈와 헷갈리지 않도록 함
  if (!code) {
    const numRe = /\b\d{5,8}\b/g;
    const numCandidates = remaining.match(numRe) || [];
    if (numCandidates.length) {
      const longestNum = numCandidates.reduce((a,b) => b.length>a.length ? b : a);
      code = longestNum;
      remaining = remaining.replace(longestNum, "").trim();
    }
  }

  // 브랜드 추정: 알려진 브랜드명이 포함되어 있으면 추출
  for (const b of KNOWN_BRANDS) {
    if (remaining.includes(b)) {
      brand = b;
      remaining = remaining.replace(b, "").trim();
      break;
    }
  }

  const name = remaining.replace(/\s{2,}/g, " ").replace(/^[·\-,\s]+|[·\-,\s]+$/g, "").trim();
  return { code, brand, name };
}
const CLOTHING_SIZES = ["70","75","80","85","90","92","95","100","105","110","115","120","XS","S","M","L","XL","XXL","XXXL"];
const BAG_SIZES = ["FREE","XS","S","M","L","XL"];
const OTHER_SIZES = ["FREE","XS","S","M","L","XL","XXL","1","2","3","4","5","6","7","8","9","10"];
const PAYMENT_TYPES = ["카드", "페이", "계좌이체", "현금", "기타"];

const PAY_TYPES = ["카카오페이","네이버페이","토스","삼성페이","애플페이","기타"];
const BANK_TYPES = ["국민","신한","우리","하나","농협","기업","카카오뱅크","토스뱅크","SC제일","씨티","기타"];
const EXPENSE_TYPES = ["주유","식대","잡자재","반품배송비","기타"];
const SETTLEMENT_PLATFORMS = ["포이즌","크림","기타"];

function generateId() { return Math.random().toString(36).substr(2,9); }
function formatNum(n) { return Number(n||0).toLocaleString("ko-KR"); }

const SUPABASE_URL = "https://pwxekgmtholibyzwbhhu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eGVrZ210aG9saWJ5endiaGh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTk2NDgsImV4cCI6MjA5ODQ3NTY0OH0.nb5zenjHB1mgEEgk9qGD_EZWMfSIhj24X3D_yZHxP6I";
const HEADERS = { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function dbGetAll(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=updated_at.asc`, { headers: HEADERS });
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(r => r.data).filter(Boolean);
  } catch { return []; }
}

async function dbUpsert(table, item) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: item.id, data: item, updated_at: new Date().toISOString() })
    });
  } catch {}
}

async function dbDelete(table, id) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE", headers: HEADERS
    });
  } catch {}
}

// ---- 상품 이미지를 Supabase Storage에 업로드 (DB row 용량 문제 해결) ----
async function uploadProductImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filename = `${generateId()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${filename}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true"
    },
    body: file
  });
  if (!res.ok) throw new Error("이미지 업로드 실패: " + res.status);
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${filename}`;
}

// ---- 영수증 사진을 Supabase Storage에 업로드 (상품과 동일한 방식, 용량 문제 예방) ----
async function uploadReceiptImage(file, id) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filename = `${id}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/receipt-images/${filename}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true"
    },
    body: file
  });
  if (!res.ok) throw new Error("영수증 이미지 업로드 실패: " + res.status);
  return `${SUPABASE_URL}/storage/v1/object/public/receipt-images/${filename}`;
}

function useDB(table) {
  const [value, setValue] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    dbGetAll(table).then(data => {
      setValue(data);
      setLoaded(true);
    });
  }, [table]);

  const set = (val) => {
    setValue(prev => {
      const next = typeof val === "function" ? val(prev) : val;
      const nextIds = new Set(next.map(x => x.id));
      next.forEach(item => {
        const prev_item = prev.find(p => p.id === item.id);
        if (!prev_item || JSON.stringify(prev_item) !== JSON.stringify(item)) {
          dbUpsert(table, item);
        }
      });
      prev.forEach(item => { if (!nextIds.has(item.id)) dbDelete(table, item.id); });
      return next;
    });
  };

  return [value, set, loaded];
}

function exportToCSV(data, filename) {
  const BOM = "\uFEFF";
  const csv = BOM + data.map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

function exportAllData(products, sales, purchases, otherIncomes, expenses, settlements, returns, trash) {
  const blob = new Blob([JSON.stringify({ products, sales, purchases, otherIncomes, expenses, settlements, returns, trash, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`resell-erp-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
}

function calcVat(price, qty) {
  const total = Number(price||0) * Number(qty||1);
  const supply = total / 1.1;
  return { supply, vat: supply * 0.1 };
}

// ---- 영수증 정리 헬퍼 ----
function parseAmt(s) { const n = (s || "").replace(/[^\d]/g, ""); return n ? parseInt(n, 10) : 0; }

const RECEIPT_PAPER = {
  A4:     { w: 210, h: 297, label: "A4 210×297mm" },
  A4L:    { w: 297, h: 210, label: "A4 297×210mm" },
  A3:     { w: 297, h: 420, label: "A3 297×420mm" },
  Letter: { w: 216, h: 279, label: "Letter" },
};
const RECEIPT_COLS = { 2: 1, 4: 2, 6: 2, 9: 3, 12: 3 };

function loadReceiptImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clipReceiptText(ctx, text, maxW) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function drawReceiptImg(ctx, img, rot, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const r = ((rot % 360) + 360) % 360;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((r * Math.PI) / 180);
  const cw = (r === 90 || r === 270) ? h : w;
  const ch = (r === 90 || r === 270) ? w : h;
  const inset = Math.min(cw, ch) * 0.05;
  const aw = cw - inset * 2, ah = ch - inset * 2;
  const scale = Math.min(aw / img.naturalWidth, ah / img.naturalHeight);
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

const emptyProduct = { code:"", brand:"", name:"", releasePrice:"", image:"", sizes:{}, category:"신발" };
const emptyPurchase = { productId:"", manualName:"", code:"", size:"", sizes:{}, price:"", qty:"1", date:new Date().toISOString().slice(0,10), place:"", payType:"카드", cardType:"삼성", payBrand:"카카오페이", bankType:"국민", payOther:"", bizNumber:"", cardNumber:"", memo:"" };
const emptySale = { productId:"", manualName:"", code:"", size:"", sizes:{}, platform:"포이즌", platformOther:"", price:"", qty:"1", fee:"", shipping:"", date:new Date().toISOString().slice(0,10), memo:"" };
const emptyExpense = { type:"주유", itemName:"", qty:"1", purchasePlace:"", amount:"", date:new Date().toISOString().slice(0,10), bizNumber:"", cardNumber:"", memo:"" };
const emptySettlement = { platform:"포이즌", amount:"", bank:"국민", bankOther:"", fee:"", date:new Date().toISOString().slice(0,10), memo:"" };
const emptyReturn = { productId:"", productName:"", productCode:"", size:"", qty:"1", purchaseId:"", date:new Date().toISOString().slice(0,10), reason:"", memo:"", shippingFee:"" };

// 5번: EditModal을 App 밖에 정의해야 리렌더링시 커서 안 날아감
function SizePicker({ data, setter, showQty=false, toggleSize, setSizeQty }) {
  const category = data.category || "신발";
  const sizeList = category === "신발" ? SIZES : category === "의류" ? CLOTHING_SIZES : category === "가방" ? BAG_SIZES : OTHER_SIZES;
  const isNumeric = category === "신발";

  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:13,color:"#6b7280",marginBottom:5,fontWeight:500}}>사이즈 선택 {showQty && "(수량도 입력 가능)"}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
        {sizeList.map(s => (
          <button key={s} onClick={() => toggleSize(s, setter)}
            style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",background:data.sizes[s]!==undefined?"#6d28d9":"#f3f4f6",color:data.sizes[s]!==undefined?"#fff":"#374151",fontSize:12,fontWeight:data.sizes[s]!==undefined?700:400}}>
            {s}
          </button>
        ))}
      </div>
      {showQty && Object.keys(data.sizes).length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {Object.keys(data.sizes).map(size => (
            <div key={size} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:12,color:"#9ca3af",minWidth:28}}>{size}</span>
              <input type="number" min="1" value={data.sizes[size]}
                onChange={e => setSizeQty(size, e.target.value, setter)}
                style={{width:55,padding:"5px 8px",borderRadius:6,border:"1px solid #d1d5db",background:"#fff",color:"#111",fontSize:13,boxSizing:"border-box"}} />
            </div>
          ))}
        </div>
      )}
      {Object.keys(data.sizes).length>0 && (
        <div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:"#f8f9fa",fontSize:11,color:"#6b7280"}}>
          선택: {Object.keys(data.sizes).map(s=>`${s}${isNumeric?"mm":""}×${data.sizes[s]}`).join(", ")}
        </div>
      )}
    </div>
  );
}


function EditModal({ title, children, onSave, onDelete, onClose }) {
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",border:"1px solid #6d28d9"}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>{title}</div>
        {children}
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={onSave} style={{padding:"10px 22px",borderRadius:8,border:"none",background:"#6d28d9",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:15}}>저장</button>
          <button onClick={onClose} style={{padding:"10px 18px",borderRadius:8,border:"none",background:"#f3f4f6",color:"#9ca3af",fontWeight:600,cursor:"pointer",fontSize:15}}>취소</button>
          {onDelete && <button onClick={onDelete} style={{padding:"10px 18px",borderRadius:8,border:"none",background:"#fee2e2",color:"#dc2626",fontWeight:600,cursor:"pointer",fontSize:15}}>삭제</button>}
        </div>
      </div>
    </div>
  );
}

const PASSWORD = "500476";

export default function App() {
  // 인증 훅 - 반드시 최상단에
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("erp_auth") === "ok");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts, prodLoaded] = useDB("products");
  const [sales, setSales, salesLoaded] = useDB("sales");
  const [purchases, setPurchases, purchLoaded] = useDB("purchases");
  const [otherIncomes, setOtherIncomes] = useDB("other_incomes");
  const [expenses, setExpenses] = useDB("expenses");
  const [settlements, setSettlements] = useDB("settlements");
  const [returns, setReturns] = useDB("returns");
  const [trash, setTrash] = useDB("trash");
  const [receipts, setReceipts] = useDB("receipts");
  const [inspections, setInspections] = useDB("inspections");
  const [cards, setCards] = useDB("cards");
  const [vendors, setVendors] = useDB("vendors");
  const loaded = prodLoaded && salesLoaded && purchLoaded;
  const [showAddReturn, setShowAddReturn] = useState(false);
  const [returnCodeSearch, setReturnCodeSearch] = useState("");
  const [newReturn, setNewReturn] = useState({...emptyReturn});
  const [editingReturn, setEditingReturn] = useState(null);
  const [stockCodeSearch, setStockCodeSearch] = useState("");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgUrlDraftAdd, setImgUrlDraftAdd] = useState("");
  const [imgUrlDraftEdit, setImgUrlDraftEdit] = useState("");
  const [inspectionSaleSearch, setInspectionSaleSearch] = useState("");
  const [selectedInspectionSaleId, setSelectedInspectionSaleId] = useState("");
  const [inspectionReason, setInspectionReason] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0,10));
  const [editingInspection, setEditingInspection] = useState(null);
  const [showCardManager, setShowCardManager] = useState(false);
  const [newCard, setNewCard] = useState({ name:"", number:"" });
  const [editingCard, setEditingCard] = useState(null);
  const [showVendorManager, setShowVendorManager] = useState(false);
  const [newVendor, setNewVendor] = useState({ name:"", bizNumber:"" });
  const [editingVendor, setEditingVendor] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddSettlement, setShowAddSettlement] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [expandedExpenseDate, setExpandedExpenseDate] = useState(null);
  const [selectedExpenseType, setSelectedExpenseType] = useState(null);
  const [expandedReturnDate, setExpandedReturnDate] = useState(null);
  const [returnQtyBySize, setReturnQtyBySize] = useState({});
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [selectedStockBrand, setSelectedStockBrand] = useState(null);
  const [selectedStockCategory, setSelectedStockCategory] = useState(null);
  const [selectedFundingKey, setSelectedFundingKey] = useState(null);
  const [selectedFundingMonth, setSelectedFundingMonth] = useState(null);
  const [selectedPurchaseMonth, setSelectedPurchaseMonth] = useState(null);
  const [selectedSaleMonth, setSelectedSaleMonth] = useState(null);
  const [selectedInspectionMonth, setSelectedInspectionMonth] = useState(null);
  const [selectedExpenseMonth, setSelectedExpenseMonth] = useState(null);
  const [expandedFundingDate, setExpandedFundingDate] = useState(null);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [scanMode, setScanMode] = useState("in");
  const [scanSize, setScanSize] = useState("");
  const [newProduct, setNewProduct] = useState({...emptyProduct, sizes:{}});
  const [newSale, setNewSale] = useState({...emptySale});
  const [newPurchase, setNewPurchase] = useState({...emptyPurchase});
  const [newExpense, setNewExpense] = useState({...emptyExpense});
  const [newSettlement, setNewSettlement] = useState({...emptySettlement});
  const imageInputRef = useRef(null);
  const editImageRef = useRef(null);
  const importRef = useRef(null);
  const receiptFileRef = useRef(null);
  const [receiptTitle, setReceiptTitle] = useState("");
  const [receiptPaper, setReceiptPaper] = useState("A4");
  const [receiptPerPage, setReceiptPerPage] = useState("6");

  // 8번: 삭제 → 휴지통
  const moveToTrash = (item, type) => {
    setTrash(prev => [...prev, { ...item, _type: type, _deletedAt: new Date().toISOString() }]);
    if (type === "sale") setSales(prev => prev.filter(x => x.id !== item.id));
    if (type === "purchase") setPurchases(prev => prev.filter(x => x.id !== item.id));
    if (type === "expense") setExpenses(prev => prev.filter(x => x.id !== item.id));
    if (type === "settlement") setSettlements(prev => prev.filter(x => x.id !== item.id));
    if (type === "product") setProducts(prev => prev.filter(x => x.id !== item.id));
  };

  const restoreFromTrash = (item) => {
    const { _type, _deletedAt, ...original } = item;
    if (_type === "sale") setSales(prev => [...prev, original]);
    if (_type === "purchase") setPurchases(prev => [...prev, original]);
    if (_type === "expense") setExpenses(prev => [...prev, original]);
    if (_type === "settlement") setSettlements(prev => [...prev, original]);
    if (_type === "product") setProducts(prev => [...prev, original]);
    setTrash(prev => prev.filter(x => x.id !== item.id));
  };

  // 16번: 검수 처리 - 할인판매(매출액 90%로 자동 수정) / 거래실패(매출 취소 -> 재고 자동 회수)
  // 17번: 처리 시 사유도 함께 저장
  const processInspection = (sale, result, reason, date) => {
    const finalDate = date || new Date().toISOString().slice(0,10);
    if (result === "할인판매") {
      const originalPrice = Number(sale.price);
      const discountedPrice = Math.round(originalPrice * 0.9);
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, price: discountedPrice } : s));
      setInspections(prev => [...prev, {
        id: generateId(), saleId: sale.id, productId: sale.productId, productName: sale.productName,
        productCode: sale.productCode, size: sale.size, qty: sale.qty, date: finalDate,
        result, originalPrice, newPrice: discountedPrice, reason: reason||"",
      }]);
    } else if (result === "거래실패") {
      setInspections(prev => [...prev, {
        id: generateId(), saleId: sale.id, productId: sale.productId, productName: sale.productName,
        productCode: sale.productCode, size: sale.size, qty: sale.qty, date: finalDate,
        result, originalPrice: Number(sale.price), newPrice: 0, reason: reason||"",
      }]);
      // 매출 기록은 그대로 두고 "검수불통" 표시만 남김. 재고 계산(calcStock)에서 inspectionFailed=true인 매출은
      // 자동으로 제외되므로 별도 처리 없이 재고가 다시 복원됨
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, inspectionFailed: true } : s));
    }
    setSelectedInspectionSaleId("");
    setInspectionReason("");
    setInspectionDate(new Date().toISOString().slice(0,10));
  };

  // 검수 처리 이전 상태로 매출 기록을 되돌림 (수정/삭제 시 사용)
  const revertInspection = (insp) => {
    if (insp.result === "할인판매") {
      setSales(prev => prev.map(s => s.id === insp.saleId ? { ...s, price: insp.originalPrice } : s));
    } else if (insp.result === "거래실패") {
      setSales(prev => prev.map(s => s.id === insp.saleId ? { ...s, inspectionFailed: false } : s));
    }
  };

  const saveEditedInspection = () => {
    const original = inspections.find(i => i.id === editingInspection.id);
    if (!original) { setEditingInspection(null); return; }

    if (original.result === editingInspection.result) {
      // 결과(할인판매/거래실패)가 그대로면 매출 쪽은 건드리지 않고 검수 기록의 날짜/사유만 바로 수정
      setInspections(prev => prev.map(i => i.id === editingInspection.id
        ? { ...i, date: editingInspection.date, reason: editingInspection.reason }
        : i
      ));
      setEditingInspection(null);
      return;
    }

    // 결과 자체를 바꾼 경우에만 매출 쪽 이전 처리를 되돌리고 새 결과를 다시 적용
    const sale = sales.find(s => s.id === editingInspection.saleId);
    if (!sale) { alert("연결된 매출 내역을 찾을 수 없어요."); return; }
    revertInspection(original);
    setInspections(prev => prev.filter(i => i.id !== editingInspection.id));
    const revertedSale = { ...sale, price: original.result==="할인판매" ? original.originalPrice : sale.price, inspectionFailed: false };
    processInspection(revertedSale, editingInspection.result, editingInspection.reason, editingInspection.date);
    setEditingInspection(null);
  };

  const deleteInspection = (insp) => {
    if (!window.confirm("이 검수 처리를 삭제할까요? 매출 내역이 검수 이전 상태로 되돌아갑니다.")) return;
    revertInspection(insp);
    setInspections(prev => prev.filter(i => i.id !== insp.id));
    setEditingInspection(null);
  };

  // ---- 19번: 카드 목록 관리 ----
  const addCard = () => {
    if (!newCard.name || !newCard.number) { alert("카드 이름과 카드번호를 입력해주세요."); return; }
    setCards(prev => [...prev, { ...newCard, id: generateId() }]);
    setNewCard({ name:"", number:"" });
  };
  const saveEditedCard = () => {
    setCards(prev => prev.map(c => c.id===editingCard.id ? editingCard : c));
    setEditingCard(null);
  };
  const deleteCard = (id) => {
    if (!window.confirm("이 카드를 목록에서 삭제할까요?")) return;
    setCards(prev => prev.filter(c => c.id !== id));
    setEditingCard(null);
  };

  // ---- 20번: 거래처 목록 관리 ----
  const addVendor = () => {
    if (!newVendor.name || !newVendor.bizNumber) { alert("거래처명과 사업자번호를 입력해주세요."); return; }
    setVendors(prev => [...prev, { ...newVendor, id: generateId() }]);
    setNewVendor({ name:"", bizNumber:"" });
  };
  const saveEditedVendor = () => {
    setVendors(prev => prev.map(v => v.id===editingVendor.id ? editingVendor : v));
    setEditingVendor(null);
  };
  const deleteVendor = (id) => {
    if (!window.confirm("이 거래처를 목록에서 삭제할까요?")) return;
    setVendors(prev => prev.filter(v => v.id !== id));
    setEditingVendor(null);
  };

  const handleImageUpload = (e, isEdit=false) => {
    const file = e.target.files[0]; if (!file) return;
    const setTarget = isEdit ? setEditingProduct : setNewProduct;
    setImgUploading(true);
    uploadProductImage(file).then(url => {
      setTarget(prev => ({ ...prev, image: url }));
      setImgUploading(false);
    }).catch(err => {
      console.error(err);
      alert("이미지 업로드에 실패했어요. 잠시 후 다시 시도해주세요.");
      setImgUploading(false);
    });
    e.target.value = "";
  };

  // ---- 업그레이드 A: 포이즌 등에서 복사한 상품정보 붙여넣기 자동 정리 ----
  const handleProductTextPaste = (e, isEdit=false) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const parsed = parsePastedProductText(text);
    const setTarget = isEdit ? setEditingProduct : setNewProduct;
    setTarget(prev => ({
      ...prev,
      code: parsed.code || prev.code,
      brand: parsed.brand || prev.brand,
      name: parsed.name || prev.name,
    }));
  };

  // 이미지 주소(URL)를 입력/붙여넣으면: 가능하면 Storage로 내려받아 영구 저장, CORS 등으로 안되면 원본 주소를 그대로 사용 + 항상 결과를 명확히 알려줌
  const applyImageUrl = (url, isEdit=false) => {
    const clean = (url || "").trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) { alert("올바른 이미지 주소가 아니에요. http:// 또는 https://로 시작하는 주소를 넣어주세요."); return; }
    const setTarget = isEdit ? setEditingProduct : setNewProduct;
    setImgUploading(true);
    fetch(clean)
      .then(res => { if (!res.ok) throw new Error("status:" + res.status); return res.blob(); })
      .then(blob => {
        if (!blob.type.startsWith("image/")) throw new Error("not-image");
        const ext = (blob.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
        const file = new File([blob], `pasted.${ext}`, { type: blob.type });
        return uploadProductImage(file);
      })
      .then(uploadedUrl => {
        setTarget(prev => ({ ...prev, image: uploadedUrl }));
        setImgUploading(false);
        if (isEdit) setImgUrlDraftEdit(""); else setImgUrlDraftAdd("");
      })
      .catch(err => {
        setImgUploading(false);
        if (err && err.message === "not-image") {
          alert("이 주소는 이미지 파일이 아니에요.\n상품 '페이지' 주소가 아니라, 사진 위에서 마우스 우클릭 → \"이미지 주소 복사\"로 얻은 직접 이미지 링크(보통 .jpg .png 등으로 끝남)를 넣어주세요.");
          return;
        }
        // CORS 등 다른 사이트 보안 정책으로 직접 다운로드가 막힌 경우 - 원본 주소로 화면 표시만 시도
        setTarget(prev => ({ ...prev, image: clean }));
        if (isEdit) setImgUrlDraftEdit(""); else setImgUrlDraftAdd("");
        alert("이 사이트는 외부에서 이미지를 직접 가져가지 못하도록 막아둔 것 같아요.\n일단 그 주소로 화면 표시는 시도했는데, 이미지가 안 뜨면 이 방법으로는 가져올 수 없는 사이트예요. 이미지를 캡처하거나 저장한 뒤 '파일 선택'으로 올려주세요.");
      });
  };

  // 6번: 배열을 id 기준으로 병합 (기존 항목은 유지, 없는 항목만 추가 - 절대 삭제하지 않음)
  const mergeById = (current, incoming) => {
    if (!Array.isArray(incoming)) return current;
    const currentIds = new Set(current.map(item => item.id));
    const toAdd = incoming.filter(item => item && item.id && !currentIds.has(item.id));
    return [...current, ...toAdd];
  };

  const handleImportData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        const ok = window.confirm(
          "백업 파일을 불러오면 현재 데이터에 없는 항목만 추가됩니다.\n" +
          "기존 데이터는 삭제되거나 덮어써지지 않습니다.\n\n계속하시겠습니까?"
        );
        if (!ok) { e.target.value = ""; return; }
        if (d.products) setProducts(prev => mergeById(prev, d.products));
        if (d.sales) setSales(prev => mergeById(prev, d.sales));
        if (d.purchases) setPurchases(prev => mergeById(prev, d.purchases));
        if (d.otherIncomes) setOtherIncomes(prev => mergeById(prev, d.otherIncomes));
        if (d.expenses) setExpenses(prev => mergeById(prev, d.expenses));
        if (d.settlements) setSettlements(prev => mergeById(prev, d.settlements));
        if (d.returns) setReturns(prev => mergeById(prev, d.returns));
        if (d.trash) setTrash(prev => mergeById(prev, d.trash));
        alert("불러오기 완료! 기존 데이터는 유지되고, 없던 항목만 추가되었습니다.");
      } catch { alert("파일 오류"); }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // 9번: 사이즈별 수량 토글
  const toggleSize = (size, setter) => {
    setter(prev => {
      const sizes = { ...prev.sizes };
      if (sizes[size] !== undefined) delete sizes[size]; else sizes[size] = 0;
      return { ...prev, sizes };
    });
  };

  const setSizeQty = (size, qty, setter) => {
    setter(prev => ({ ...prev, sizes: { ...prev.sizes, [size]: Number(qty)||1 } }));
  };

  const handleScan = (e) => {
    if (e.key !== "Enter") return;
    const barcode = scanInput.trim();
    const found = products.find(p => p.barcode === barcode);
    if (found) {
      if (!scanSize) { setScanResult({ type:"error", msg:"사이즈를 선택해주세요!" }); setScanInput(""); return; }
      const stock = found.sizes[scanSize] || 0;
      if (scanMode === "in") {
        setProducts(prev => prev.map(p => p.id===found.id ? { ...p, sizes:{ ...p.sizes, [scanSize]: stock+1 } } : p));
        setScanResult({ type:"success", msg:`입고: ${found.name} ${scanSize}mm (재고 ${stock+1}개)` });
      } else {
        if (stock<=0) setScanResult({ type:"error", msg:`재고 없음: ${found.name} ${scanSize}mm` });
        else {
          setProducts(prev => prev.map(p => p.id===found.id ? { ...p, sizes:{ ...p.sizes, [scanSize]: stock-1 } } : p));
          setScanResult({ type:"success", msg:`출고: ${found.name} ${scanSize}mm (재고 ${stock-1}개)` });
        }
      }
    } else setScanResult({ type:"error", msg:`바코드 없음: ${barcode}` });
    setScanInput("");
    setTimeout(() => setScanResult(null), 3000);
  };

  const calcProfit = (sale) => {
    const prod = products.find(x => x.id===sale.productId);
    const buyRecord = purchases.filter(p => p.productId===sale.productId && p.size===sale.size).slice(-1)[0];
    const buyPrice = Number(buyRecord?.price || prod?.releasePrice || 0);
    const fee = Number(sale.fee||0), shipping = Number(sale.shipping||0);
    const profit = (Number(sale.price) - buyPrice - fee - shipping) * Number(sale.qty||1);
    const profitRate = buyPrice>0 ? ((Number(sale.price)-buyPrice-fee-shipping)/buyPrice*100) : 0;
    return { profit, profitRate, buyPrice };
  };

  // 재고 실시간 계산: 매입수량 - 매출수량
  const calcStock = (productId, size) => {
    const inQty = purchases.filter(p => p.productId===productId && p.size===size).reduce((s,p) => s+Number(p.qty||1), 0);
    // 검수불통(거래실패) 처리된 매출은 재고 계산에서 제외 -> 자동으로 재고가 복원됨
    const outQty = sales.filter(s => s.productId===productId && s.size===size && !s.inspectionFailed).reduce((s,x) => s+Number(x.qty||1), 0);
    const returnQty = returns.filter(r => r.productId===productId && r.size===size).reduce((s,r) => s+Number(r.qty||1), 0);
    return inQty - outQty - returnQty;
  };

  // 3번: 품번으로 자동 검색
  // 3번: 품번 정규화 - 공백/하이픈 무시
  const normalizeCode = (code) => code.replace(/[\s-]/g, "").toLowerCase();

  const handleCodeInput = (code, type) => {
    const found = products.find(p => p.code && normalizeCode(p.code)===normalizeCode(code));
    if (type==="sale") setNewSale(prev => ({ ...prev, code, productId: found?.id||"", manualName: found ? "" : prev.manualName, size:"" }));
    else setNewPurchase(prev => ({ ...prev, code, productId: found?.id||"", manualName: found ? "" : prev.manualName, size:"", sizes:{}, category: found?.category||"신발" }));
  };

  // 4번: 반품 금액 계산 - 연결된 매입 내역의 단가를 기준으로 계산
  // 반품된 매입 건의 단가 추정 (연결된 매입 기록 기준, 없으면 동일 상품/사이즈의 최근 매입가로 대체)
  const getReturnUnitPrice = (r) => {
    let unitPrice = 0;
    if (r.purchaseIds && r.purchaseIds.length > 0) {
      const matched = purchases.filter(p => r.purchaseIds.includes(p.id));
      if (matched.length > 0) unitPrice = matched.reduce((s,p)=>s+Number(p.price||0),0) / matched.length;
    }
    if (!unitPrice) {
      const fallback = purchases.filter(p => p.productId === r.productId && p.size === r.size).slice(-1)[0];
      if (fallback) unitPrice = Number(fallback.price || 0);
    }
    return unitPrice;
  };
  const calcReturnAmount = (r) => getReturnUnitPrice(r) * Number(r.qty || 1);

  // 거래실패(검수불통) 처리된 매출은 실제 거래가 무산된 것이므로 매출/수익 합계에서 제외
  const totalSell = sales.filter(x=>!x.inspectionFailed).reduce((s,x) => s+Number(x.price)*Number(x.qty||1), 0);
  const totalPurchaseRaw = purchases.reduce((s,x) => s+Number(x.price)*Number(x.qty||1), 0);
  const totalReturnAmount = returns.reduce((s,r) => s+calcReturnAmount(r), 0);
  const totalBuy = totalPurchaseRaw - totalReturnAmount;
  const totalProfit = sales.filter(x=>!x.inspectionFailed).reduce((s,sale) => s+calcProfit(sale).profit, 0);
  const totalExpenses = expenses.reduce((s,x) => s+Number(x.amount||0), 0);
  const totalSettled = settlements.reduce((s,x) => s+Number(x.amount||0), 0);
  // 9번: 부가세환급 예상 금액 - 반품된 건은 환급 대상에서 차감
  const totalReturnVat = returns.reduce((s,r) => s+calcVat(getReturnUnitPrice(r), r.qty).vat, 0);
  const totalVatRefund = purchases.reduce((s,p) => s+calcVat(p.price,p.qty).vat, 0) - totalReturnVat;
  const receiptTotal = receipts.reduce((s,r) => s+parseAmt(r.amt), 0);

  // 8번: 재고현황 총 수량/금액 (매입가 평균 기준으로 재고 가치 추정)
  const totalStockQty = products.reduce((s,p) => s+Object.keys(p.sizes||{}).reduce((s2,size)=>s2+Math.max(calcStock(p.id,size),0),0), 0);
  const totalStockValue = products.reduce((sum,p) => sum+Object.keys(p.sizes||{}).reduce((s2,size) => {
    const stock = Math.max(calcStock(p.id,size),0);
    if (stock<=0) return s2;
    const relevantPurchases = purchases.filter(x=>x.productId===p.id && x.size===size);
    const avgPrice = relevantPurchases.length>0 ? relevantPurchases.reduce((s3,x)=>s3+Number(x.price||0),0)/relevantPurchases.length : 0;
    return s2 + stock*avgPrice;
  }, 0), 0);

  // 2번: 기존 상품 재고 일괄 0 초기화
  const resetAllStockToZero = () => {
    if (!window.confirm("모든 상품의 재고를 0으로 초기화할까요?\n매입 등록으로 재고를 다시 쌓아야 해요.")) return;
    setProducts(prev => prev.map(p => ({
      ...p,
      sizes: Object.fromEntries(Object.keys(p.sizes).map(s => [s, 0]))
    })));
    alert("모든 상품 재고가 0으로 초기화됐어요!");
  };

  const addProduct = () => {
    if (!newProduct.name) { alert("상품명 필수!"); return; }
    if (Object.keys(newProduct.sizes).length===0) { alert("사이즈 선택!"); return; }
    if (newProduct.code) {
      const dup = products.find(p => p.code && normalizeCode(p.code)===normalizeCode(newProduct.code));
      if (dup) { alert(`⚠️ 이미 등록된 품번이에요!\n\n상품명: ${dup.name}\n브랜드: ${dup.brand}\n\n품번을 확인해주세요.`); return; }
    }
    setProducts(prev => [...prev, { ...newProduct, id:generateId(), releasePrice:Number(newProduct.releasePrice)||0 }]);
    setNewProduct({...emptyProduct, sizes:{}}); setShowAddProduct(false);
  };

  const saveEditProduct = () => {
    if (!editingProduct.name) { alert("상품명 필수!"); return; }
    setProducts(prev => prev.map(p => p.id===editingProduct.id ? { ...editingProduct, releasePrice:Number(editingProduct.releasePrice)||0 } : p));
    setEditingProduct(null);
  };

  const addSale = () => {
    if (!newSale.productId && !newSale.manualName) { alert("상품 선택 또는 입력!"); return; }
    if (!newSale.price) { alert("판매가 입력!"); return; }
    const prod = products.find(p => p.id===newSale.productId);
    setSales(prev => [...prev, { ...newSale, id:generateId(), price:Number(newSale.price), qty:Number(newSale.qty)||1, productName:prod?.name||newSale.manualName, productCode:prod?.code||newSale.code }]);
    setNewSale({...emptySale}); setShowAddSale(false);
  };

  const addPurchase = () => {
    if (!newPurchase.productId && !newPurchase.manualName) { alert("상품 선택 또는 입력!"); return; }
    if (!newPurchase.price) { alert("매입가 입력!"); return; }
    const prod = products.find(p => p.id===newPurchase.productId);
    const entries = Object.keys(newPurchase.sizes).length > 0 ? newPurchase.sizes : newPurchase.size ? {[newPurchase.size]: Number(newPurchase.qty)||1} : {};
    if (Object.keys(entries).length === 0) { alert("사이즈를 선택해주세요!"); return; }
    Object.entries(entries).forEach(([size, qty]) => {
      setPurchases(prev => [...prev, { ...newPurchase, id:generateId(), size, qty:Number(qty), price:Number(newPurchase.price), productName:prod?.name||newPurchase.manualName, productCode:prod?.code||newPurchase.code }]);
    });
    setNewPurchase({...emptyPurchase}); setShowAddPurchase(false);
  };

  const addExpense = () => {
    if (!newExpense.amount) { alert("금액 입력!"); return; }
    setExpenses(prev => [...prev, { ...newExpense, id:generateId(), amount:Number(newExpense.amount) }]);
    setNewExpense({...emptyExpense}); setShowAddExpense(false);
  };

  const addSettlement = () => {
    if (!newSettlement.amount) { alert("금액 입력!"); return; }
    setSettlements(prev => [...prev, { ...newSettlement, id:generateId(), amount:Number(newSettlement.amount) }]);
    setNewSettlement({...emptySettlement}); setShowAddSettlement(false);
  };

  // ---- 영수증 정리 ----
  const addReceiptFiles = (files) => {
    const imgs = [...files].filter(f => f.type && f.type.startsWith("image/"));
    imgs.forEach(f => {
      const id = generateId();
      setReceipts(prev => [...prev, { id, src: "", rot: 0, desc: "", amt: "", uploading: true }]);
      uploadReceiptImage(f, id).then(url => {
        setReceipts(prev => prev.map(r => r.id === id ? { ...r, src: url, uploading: false } : r));
      }).catch(err => {
        console.error(err);
        setReceipts(prev => prev.map(r => r.id === id ? { ...r, uploading: false } : r));
        alert("영수증 이미지 업로드에 실패했어요. 다시 시도해주세요.");
      });
    });
  };

  const updateReceipt = (id, patch) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const deleteReceipt = (id) => {
    setReceipts(prev => prev.filter(r => r.id !== id));
  };

  const reorderReceipt = (from, to) => {
    if (to < 0 || to >= receipts.length) return;
    setReceipts(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const exportReceiptImages = async () => {
    if (receipts.length === 0) { alert("먼저 영수증을 추가해주세요."); return; }
    if (receipts.some(r => r.uploading || !r.src)) { alert("아직 업로드 중인 영수증이 있어요. 잠시 후 다시 시도해주세요."); return; }
    try {
      const perPage = Number(receiptPerPage);
      const cols = RECEIPT_COLS[perPage];
      const rows = Math.ceil(perPage / cols);
      const paper = RECEIPT_PAPER[receiptPaper];
      const title = receiptTitle.trim() || "영수증 정리";
      const pageCount = Math.max(1, Math.ceil(receipts.length / perPage));
      const DPI = 200, ppm = DPI / 25.4;
      const W = Math.round(paper.w * ppm), H = Math.round(paper.h * ppm);
      const pad = Math.round(W * 0.05), gap = Math.round(pad * 0.55), headH = Math.round(W * 0.05);
      const imgEls = await Promise.all(receipts.map(r => loadReceiptImg(r.src)));
      const safeName = title.replace(/[\\/:*?"<>|]/g, "_");

      for (let p = 0; p < pageCount; p++) {
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

        ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillStyle = "#1c1a17";
        const tfs = Math.round(W * 0.024);
        ctx.font = `800 ${tfs}px Pretendard, sans-serif`;
        ctx.fillText(title, pad, pad + tfs);
        ctx.textAlign = "right"; ctx.fillStyle = "#8a8378";
        ctx.font = `${Math.round(W * 0.012)}px monospace`;
        ctx.fillText(`${paper.label}   page ${p + 1}/${pageCount}`, W - pad, pad + tfs * 0.7);
        ctx.textAlign = "left";

        const lineY = pad + headH;
        ctx.strokeStyle = "#1c1a17"; ctx.lineWidth = Math.max(2, W * 0.0016);
        ctx.beginPath(); ctx.moveTo(pad, lineY); ctx.lineTo(W - pad, lineY); ctx.stroke();

        const gridTop = lineY + gap, gridW = W - pad * 2, footH = Math.round(W * 0.05);
        const gridH = H - gridTop - pad - footH;
        const cellW = (gridW - gap * (cols - 1)) / cols;
        const cellH = (gridH - gap * (rows - 1)) / rows;
        const memoH = Math.max(34, Math.round(cellH * 0.14));
        const radius = Math.round(W * 0.006);

        for (let i = 0; i < perPage; i++) {
          const idx = p * perPage + i;
          if (idx >= receipts.length) break;
          const col = i % cols, row = Math.floor(i / cols);
          const cx = pad + col * (cellW + gap);
          const cy = gridTop + row * (cellH + gap);
          const imgH = cellH - memoH;

          ctx.fillStyle = "#f7f5f0"; ctx.fillRect(cx, cy, cellW, imgH);
          drawReceiptImg(ctx, imgEls[idx], receipts[idx].rot, cx, cy, cellW, imgH);

          ctx.strokeStyle = "#e4ded3"; ctx.lineWidth = Math.max(1, W * 0.0008);
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(cx, cy + imgH); ctx.lineTo(cx + cellW, cy + imgH); ctx.stroke();
          ctx.setLineDash([]);

          const fs = Math.round(memoH * 0.42), baseY = cy + imgH + memoH * 0.62;
          ctx.font = `600 ${fs}px Pretendard, sans-serif`;
          ctx.fillStyle = "#1c1a17"; ctx.textAlign = "left";
          ctx.fillText(clipReceiptText(ctx, receipts[idx].desc, cellW * 0.62 - fs), cx + fs * 0.6, baseY);
          ctx.fillStyle = "#6d28d9"; ctx.textAlign = "right";
          ctx.font = `600 ${fs}px monospace`;
          ctx.fillText(receipts[idx].amt ? "₩" + receipts[idx].amt : "", cx + cellW - fs * 0.6, baseY);
          ctx.textAlign = "left";

          ctx.strokeStyle = "#e4ded3"; ctx.lineWidth = Math.max(1, W * 0.0008);
          roundRectPath(ctx, cx, cy, cellW, cellH, radius); ctx.stroke();
        }

        const footTop = gridTop + gridH + gap;
        ctx.strokeStyle = "#1c1a17"; ctx.lineWidth = Math.max(2, W * 0.0016);
        ctx.beginPath(); ctx.moveTo(pad, footTop); ctx.lineTo(W - pad, footTop); ctx.stroke();

        const sumStr = "₩" + formatNum(receiptTotal);
        const fy = footTop + footH * 0.62, afs = Math.round(footH * 0.5);
        ctx.textAlign = "right"; ctx.fillStyle = "#6d28d9";
        ctx.font = `700 ${afs}px monospace`;
        ctx.fillText(sumStr, W - pad, fy);
        const sumW = ctx.measureText(sumStr).width;
        const lfs = Math.round(footH * 0.36);
        ctx.font = `700 ${lfs}px Pretendard, sans-serif`;
        ctx.fillStyle = "#8a8378";
        ctx.fillText("총 합계", W - pad - sumW - afs * 0.6, fy);
        ctx.textAlign = "left";

        const url = cv.toDataURL("image/jpeg", 0.92);
        const fname = pageCount > 1 ? `${safeName}_${p + 1}.jpg` : `${safeName}.jpg`;
        const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
      }
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 문제가 발생했어요. 다시 시도해주세요.");
    }
  };

  // 5번: 메뉴 순서
  const tabs = [
    {id:"dashboard",label:"📊 대시보드"},
    {id:"scan",label:"📦 바코드"},
    {id:"products",label:"👟 상품"},
    {id:"purchases",label:"🛒 매입"},
    {id:"sales",label:"💰 매출"},
    {id:"inspection",label:"🔍 검수"},
    {id:"stock",label:"📋 재고현황"},
    {id:"returns",label:"↩️ 반품"},
    {id:"expenses",label:"💸 경비"},
    {id:"settlements",label:"🏦 정산"},
    {id:"funding",label:"💳 매입자금"},
    {id:"receipts",label:"🧾 영수증"},
    {id:"trash",label:"🗑️ 휴지통"},
  ];

  const inp = { width:"100%", padding:"10px 14px", borderRadius:8, border:"1px solid #d1d5db", background:"#fff", color:"#111", fontSize:15, boxSizing:"border-box" };
  const sel = {...inp};
  const btn1 = { padding:"10px 22px", borderRadius:8, border:"none", background:"#6d28d9", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:15 };
  const btn2 = { padding:"10px 18px", borderRadius:8, border:"1px solid #d1d5db", background:"#f9fafb", color:"#6b7280", fontWeight:600, cursor:"pointer", fontSize:15 };
  const btnDanger = { padding:"10px 18px", borderRadius:8, border:"none", background:"#fee2e2", color:"#dc2626", fontWeight:600, cursor:"pointer", fontSize:15 };
  const cs = { background:"#fff", borderRadius:12, padding:20, border:"1px solid #e5e7eb", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" };
  const lbl = { fontSize:13, color:"#6b7280", marginBottom:5, fontWeight:500 };

  const selectedProd = products.find(p => p.id===newSale.productId);
  const selectedProdP = products.find(p => p.id===newPurchase.productId);

  // 수정 모드 공통

  const handleLogin = () => {
    if (pwInput === PASSWORD) {
      sessionStorage.setItem("erp_auth", "ok");
      setAuthed(true);
    } else {
      setPwError(true);
      setTimeout(() => setPwError(false), 2000);
    }
  };

  if (!authed) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f3f4f6",gap:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:40,boxShadow:"0 4px 20px rgba(0,0,0,0.1)",width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:800,color:"#6d28d9",marginBottom:8}}>RESELL ERP</div>
        <div style={{fontSize:13,color:"#9ca3af",marginBottom:24}}>비밀번호를 입력해주세요</div>
        <input
          type="password"
          value={pwInput}
          onChange={e=>setPwInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()}
          placeholder="비밀번호"
          style={{width:"100%",padding:"12px 16px",borderRadius:10,border:pwError?"2px solid #dc2626":"2px solid #e5e7eb",background:"#f9fafb",color:"#111",fontSize:16,boxSizing:"border-box",marginBottom:8,outline:"none"}}
          autoFocus
        />
        {pwError && <div style={{color:"#dc2626",fontSize:13,marginBottom:8}}>비밀번호가 틀렸어요!</div>}
        <button onClick={handleLogin} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#6d28d9",color:"#fff",fontWeight:700,fontSize:16,cursor:"pointer",marginTop:8}}>
          입장
        </button>
      </div>
    </div>
  );

  if (!loaded) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f3f4f6",gap:16}}>
      <div style={{fontSize:24,fontWeight:800,color:"#6d28d9"}}>RESELL ERP</div>
      <div style={{fontSize:14,color:"#6b7280"}}>데이터 불러오는 중...</div>
      <div style={{width:40,height:40,border:"4px solid #e5e7eb",borderTop:"4px solid #6d28d9",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#f3f4f6",minHeight:"100vh",color:"#111"}}>
      <div style={{background:"#6d28d9",borderBottom:"none",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>RESELL ERP</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={() => exportAllData(products,sales,purchases,otherIncomes,expenses,settlements,returns,trash)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid rgba(255,255,255,0.4)",background:"transparent",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13}}>💾 백업</button>
          <button onClick={() => importRef.current.click()} style={{padding:"6px 14px",borderRadius:6,border:"1px solid rgba(255,255,255,0.4)",background:"transparent",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13}}>📂 불러오기</button>
          <input ref={importRef} type="file" accept=".json" onChange={handleImportData} style={{display:"none"}} />
        </div>
      </div>

      <div style={{display:"flex",background:"#fff",borderBottom:"2px solid #e5e7eb",overflowX:"auto"}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{padding:"12px 16px",border:"none",background:"none",color:tab===t.id?"#6d28d9":"#888",borderBottom:tab===t.id?"2px solid #6d28d9":"2px solid transparent",fontWeight:tab===t.id?700:400,cursor:"pointer",fontSize:14,whiteSpace:"nowrap"}}>{t.label}</button>
        ))}
      </div>

      <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>

        {/* 대시보드 */}
        {tab==="dashboard" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
              {[
                {label:"매입",value:`${formatNum(totalBuy)}원`,color:"#d97706"},
                {label:"매출",value:`${formatNum(totalSell)}원`,color:"#6d28d9"},
                {label:"수익",value:`${formatNum(totalProfit)}원`,color:totalProfit>=0?"#059669":"#dc2626"},
                {label:"경비",value:`${formatNum(totalExpenses)}원`,color:"#dc2626"},
                {label:"정산",value:`${formatNum(totalSettled)}원`,color:"#0369a1"},
                {label:"부가세환급 예상",value:`${formatNum(Math.round(totalVatRefund))}원`,color:"#b45309"},
                {label:"재고현황",value:`${formatNum(totalStockQty)}개 · ${formatNum(Math.round(totalStockValue))}원`,color:"#6d28d9"},
                {label:"등록 상품",value:`${products.length}개`,color:"#7c3aed"},
              ].map(c => (
                <div key={c.label} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #e5e7eb"}}>
                  <div style={{fontSize:10,color:"#6b7280",marginBottom:5}}>{c.label}</div>
                  <div style={{fontSize:15,fontWeight:700,color:c.color}}>{c.value}</div>
                </div>
              ))}
            </div>
            <div style={cs}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#9ca3af"}}>플랫폼별 매출</div>
              {["포이즌","크림","기타"].map(p => {
                const total = sales.filter(s=>s.platform===p).reduce((sum,s)=>sum+Number(s.price)*Number(s.qty||1),0);
                const count = sales.filter(s=>s.platform===p).length;
                return (
                  <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:p==="포이즌"?"#6d28d9":p==="크림"?"#4ade80":"#fb923c"}}/>
                      <span style={{fontSize:13}}>{p}</span>
                      <span style={{fontSize:11,color:"#6b7280"}}>{count}건</span>
                    </div>
                    <span style={{fontWeight:700}}>{formatNum(total)}원</span>
                  </div>
                );
              })}
            </div>
            <div style={cs}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#9ca3af"}}>경비 현황</div>
              {EXPENSE_TYPES.map(type => {
                const total = expenses.filter(e=>e.type===type).reduce((s,e)=>s+Number(e.amount),0);
                return total>0 ? (
                  <div key={type} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:13}}>{type}</span>
                    <span style={{fontWeight:700,color:"#dc2626"}}>{formatNum(total)}원</span>
                  </div>
                ) : null;
              })}
              {totalExpenses===0 && <div style={{color:"#6b7280",fontSize:13}}>경비 없음</div>}
            </div>
          </div>
        )}

        {/* 바코드 */}
        {tab==="scan" && (
          <div>
            <div style={cs}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>바코드 스캔</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                {["in","out"].map(m=>(
                  <button key={m} onClick={()=>setScanMode(m)} style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",background:scanMode===m?"#6d28d9":"#f3f4f6",color:"#fff",fontWeight:600,fontSize:13}}>
                    {m==="in"?"📥 입고":"📤 출고"}
                  </button>
                ))}
              </div>
              <div style={{marginBottom:10}}>
                <div style={lbl}>사이즈</div>
                <select value={scanSize} onChange={e=>setScanSize(e.target.value)} style={{...sel,width:150}}>
                  <option value="">선택</option>
                  {SIZES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <input value={scanInput} onChange={e=>setScanInput(e.target.value)} onKeyDown={handleScan}
                placeholder="바코드 스캔 후 Enter" autoFocus
                style={{width:"100%",padding:"13px 16px",borderRadius:10,border:"2px solid #6d28d9",background:"#fff",color:"#111",fontSize:15,boxSizing:"border-box"}}/>
              {scanResult && <div style={{marginTop:10,padding:"10px 14px",borderRadius:8,background:scanResult.type==="success"?"#14532d":"#450a0a",color:scanResult.type==="success"?"#4ade80":"#f87171",fontSize:13,fontWeight:600}}>{scanResult.msg}</div>}
            </div>
            <div style={cs}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#9ca3af"}}>재고 현황</div>
              {products.length===0 ? <div style={{color:"#6b7280",fontSize:13}}>상품 없음</div>
                : [...products].sort((a,b)=>{ const bc=a.brand.localeCompare(b.brand,"ko"); return bc!==0?bc:a.name.localeCompare(b.name,"ko"); }).map(p=>(
                  <div key={p.id} style={{padding:"10px 0",borderBottom:"1px solid #e5e7eb"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      {p.image ? <img src={p.image} alt="" style={{width:34,height:34,borderRadius:6,objectFit:"contain",background:"#f3f4f6"}}/> : <div style={{width:34,height:34,borderRadius:6,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center"}}>👟</div>}
                      <div>
                        <div style={{fontSize:13,fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#6b7280"}}>{p.brand} · {p.code}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {Object.keys(p.sizes).sort((a,b)=>a-b).map(size=>{ const stock=calcStock(p.id,size); if(stock<=0) return null; return (
                        <div key={size} style={{padding:"3px 9px",borderRadius:6,background:stock<=2?"#fef3c7":"#d1fae5",fontSize:12}}>
                          <span style={{color:"#9ca3af"}}>{size}</span>
                          <span style={{color:stock<=2?"#d97706":"#059669",fontWeight:700,marginLeft:3}}>{stock}</span>
                        </div>
                      );})}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* 상품 */}
        {tab==="products" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>상품 목록</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={resetAllStockToZero} style={{...btnDanger,fontSize:12}}>재고 전체 초기화</button>
                <button onClick={()=>setShowAddProduct(true)} style={btn1}>+ 상품 추가</button>
              </div>
            </div>

            {showAddProduct && (
              <div style={{...cs,border:"1px solid #6d28d9"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>새 상품 등록</div>
                <div style={{marginBottom:12}}>
                  <div style={lbl}>🔗 빠른 붙여넣기 (포이즌 등에서 복사한 상품명/품번 텍스트)</div>
                  <textarea
                    onPaste={e=>handleProductTextPaste(e,false)}
                    placeholder="상품 페이지에서 텍스트를 복사해 여기에 붙여넣으면 품번/브랜드/상품명을 자동으로 정리해봐요 (자동 인식이 틀리면 아래에서 직접 수정하면 돼요)"
                    style={{...inp,minHeight:56,resize:"vertical",fontFamily:"inherit"}}
                  />
                </div>
                <div style={{marginBottom:12}}>
                  <div style={lbl}>카테고리</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {CATEGORIES.map(c=>(
                      <button key={c} onClick={()=>setNewProduct(prev=>({...prev,category:c,sizes:{}}))}
                        style={{padding:"6px 16px",borderRadius:8,border:"none",cursor:"pointer",background:newProduct.category===c?"#6d28d9":"#f3f4f6",color:newProduct.category===c?"#fff":"#374151",fontWeight:newProduct.category===c?700:400,fontSize:13}}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 2번: contain */}
                <div style={{marginBottom:12}}>
                  <div style={lbl}>이미지</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    {newProduct.image ? <img src={newProduct.image} alt="" style={{width:64,height:64,borderRadius:8,objectFit:"contain",background:"#f3f4f6"}}/> : <div style={{width:64,height:64,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#9ca3af"}}>👟</div>}
                    {imgUploading && <span style={{fontSize:12,color:"#6d28d9"}}>업로드 중...</span>}
                    <button onClick={()=>imageInputRef.current.click()} style={{...btn2,fontSize:12}}>파일 선택</button>
                    <input ref={imageInputRef} type="file" accept="image/*" onChange={e=>handleImageUpload(e,false)} style={{display:"none"}}/>
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <input
                      value={imgUrlDraftAdd}
                      onChange={e=>setImgUrlDraftAdd(e.target.value)}
                      onPaste={e=>{ const url=(e.clipboardData.getData("text")||"").trim(); if(url) setTimeout(()=>applyImageUrl(url,false),0); }}
                      onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); applyImageUrl(imgUrlDraftAdd,false); } }}
                      placeholder="또는 이미지 주소(URL) 붙여넣거나 입력 후 Enter"
                      style={{...inp,fontSize:12,flex:1}}
                    />
                    <button onClick={()=>applyImageUrl(imgUrlDraftAdd,false)} style={{...btn2,fontSize:12,flexShrink:0}}>적용</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {[{key:"code",label:"품번"},{key:"brand",label:"브랜드"},{key:"name",label:"상품명 *"},{key:"releasePrice",label:"발행가 (원)"}].map(f=>(
                    <div key={f.key}><div style={lbl}>{f.label}</div><input value={newProduct[f.key]} onChange={e=>setNewProduct(prev=>({...prev,[f.key]:e.target.value}))} style={inp}/></div>
                  ))}
                </div>
                <SizePicker data={newProduct} setter={setNewProduct} showQty={false} toggleSize={toggleSize} setSizeQty={setSizeQty}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addProduct} style={btn1}>저장</button>
                  <button onClick={()=>{setShowAddProduct(false);setNewProduct({...emptyProduct,sizes:{}});}} style={btn2}>취소</button>
                </div>
              </div>
            )}

            {/* 1번: 상품 수정 모달 */}
            {editingProduct && (
              <EditModal title="상품 수정"
                onSave={saveEditProduct}
                onDelete={()=>{ if(window.confirm("삭제하고 휴지통으로 이동할까요?")){ moveToTrash(editingProduct,"product"); setEditingProduct(null); } }}
                onClose={()=>setEditingProduct(null)}>
                <div style={{marginBottom:12}}>
                  <div style={lbl}>카테고리</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {CATEGORIES.map(c=>(
                      <button key={c} onClick={()=>setEditingProduct(p=>({...p,category:c,sizes:{}}))}
                        style={{padding:"6px 16px",borderRadius:8,border:"none",cursor:"pointer",background:(editingProduct.category||"신발")===c?"#6d28d9":"#f3f4f6",color:(editingProduct.category||"신발")===c?"#fff":"#374151",fontWeight:(editingProduct.category||"신발")===c?700:400,fontSize:13}}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={lbl}>이미지</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    {editingProduct.image ? <img src={editingProduct.image} alt="" style={{width:64,height:64,borderRadius:8,objectFit:"contain",background:"#f3f4f6"}}/> : <div style={{width:64,height:64,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#9ca3af"}}>👟</div>}
                    {imgUploading && <span style={{fontSize:12,color:"#6d28d9"}}>업로드 중...</span>}
                    <button onClick={()=>editImageRef.current.click()} style={{...btn2,fontSize:12}}>이미지 변경</button>
                    {editingProduct.image && <button onClick={()=>setEditingProduct(p=>({...p,image:""}))} style={{...btnDanger,fontSize:12}}>삭제</button>}
                    <input ref={editImageRef} type="file" accept="image/*" onChange={e=>handleImageUpload(e,true)} style={{display:"none"}}/>
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <input
                      value={imgUrlDraftEdit}
                      onChange={e=>setImgUrlDraftEdit(e.target.value)}
                      onPaste={e=>{ const url=(e.clipboardData.getData("text")||"").trim(); if(url) setTimeout(()=>applyImageUrl(url,true),0); }}
                      onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); applyImageUrl(imgUrlDraftEdit,true); } }}
                      placeholder="또는 이미지 주소(URL) 붙여넣거나 입력 후 Enter"
                      style={{...inp,fontSize:12,flex:1}}
                    />
                    <button onClick={()=>applyImageUrl(imgUrlDraftEdit,true)} style={{...btn2,fontSize:12,flexShrink:0}}>적용</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><div style={lbl}>품번</div><input value={editingProduct.code||""} onChange={e=>setEditingProduct(p=>({...p,code:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>브랜드</div><input value={editingProduct.brand||""} onChange={e=>setEditingProduct(p=>({...p,brand:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>상품명 *</div><input value={editingProduct.name||""} onChange={e=>setEditingProduct(p=>({...p,name:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>발행가 (원)</div><input value={editingProduct.releasePrice||""} onChange={e=>setEditingProduct(p=>({...p,releasePrice:e.target.value}))} style={inp}/></div>
                </div>
                <SizePicker data={editingProduct} setter={setEditingProduct} showQty={false} toggleSize={toggleSize} setSizeQty={setSizeQty}/>
              </EditModal>
            )}

            {products.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>등록된 상품 없음</div>
              : [...products].sort((a,b)=>{ const bc=a.brand.localeCompare(b.brand,"ko"); return bc!==0?bc:a.name.localeCompare(b.name,"ko"); }).map(p=>(
                <div key={p.id} style={{...cs,marginBottom:10,cursor:"pointer"}} onClick={()=>setEditingProduct({...p,sizes:{...p.sizes}})}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    {p.image ? <img src={p.image} alt="" style={{width:54,height:54,borderRadius:8,objectFit:"contain",background:"#f3f4f6",flexShrink:0}}/> : <div style={{width:54,height:54,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>👟</div>}
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <div style={{fontWeight:700,fontSize:17}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#6d28d9"}}>✏️ 수정</div>
                      </div>
                      <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{p.brand} · 품번: {p.code||"-"} · {p.category||"신발"} · 발행가: {formatNum(p.releasePrice)}원</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:8}}>
                        {Object.keys(p.sizes).sort((a,b)=>a-b).map(size=>{ const stock=calcStock(p.id,size); if(stock<=0) return null; return (
                          <div key={size} style={{padding:"3px 9px",borderRadius:6,background:stock<=2?"#fef3c7":"#d1fae5",fontSize:12}}>
                            <span style={{color:"#9ca3af"}}>{size}</span>
                            <span style={{color:stock<=2?"#d97706":"#059669",fontWeight:700,marginLeft:3}}>{stock}개</span>
                          </div>
                        );})}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* 매입 */}
        {tab==="purchases" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>매입 내역</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>총 매입금액 <span style={{color:"#d97706",fontWeight:700}}>{formatNum(totalPurchaseRaw)}원</span>{totalReturnAmount>0 && <span> (반품 차감 후 <span style={{color:"#d97706",fontWeight:700}}>{formatNum(totalBuy)}원</span>)</span>}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input type="date" value={exportDateFrom} onChange={e=>setExportDateFrom(e.target.value)} style={{...inp,width:130,fontSize:12,padding:"6px 10px"}} placeholder="시작일"/>
                <span style={{fontSize:12,color:"#9ca3af"}}>~</span>
                <input type="date" value={exportDateTo} onChange={e=>setExportDateTo(e.target.value)} style={{...inp,width:130,fontSize:12,padding:"6px 10px"}} placeholder="종료일"/>
                <button onClick={()=>{ const filtered=[...purchases].filter(p=>(!exportDateFrom||p.date>=exportDateFrom)&&(!exportDateTo||p.date<=exportDateTo)).sort((a,b)=>a.date.localeCompare(b.date)); const rows=[["날짜","품번","상품명","사이즈","매입가","공급가액","부가세","수량","합계","매입장소","결제수단","메모"]]; filtered.forEach(p=>{const{supply,vat}=calcVat(p.price,p.qty);const fmt=n=>Number(n||0).toLocaleString("ko-KR");rows.push([p.date,p.productCode||"",p.productName||"",p.size||"",fmt(p.price),fmt(Math.round(supply)),fmt(Math.round(vat)),p.qty,fmt(p.price*p.qty),p.place||"",p.payType||"",p.memo||""]);}); exportToCSV(rows,"매입내역.csv"); }} style={{...btn2,fontSize:12}}>📥 엑셀</button>
                <button onClick={()=>setShowAddPurchase(true)} style={btn1}>+ 매입 추가</button>
              </div>
            </div>
            {showAddPurchase && (
              <div style={{...cs,border:"1px solid #6d28d9"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>매입 등록</div>
                {selectedProdP?.image && <div style={{marginBottom:12}}><img src={selectedProdP.image} alt="" style={{width:70,height:70,borderRadius:10,objectFit:"contain",background:"#f3f4f6",border:"2px solid #6d28d9"}}/></div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {/* 3번: 품번 자동검색 */}
                  <div><div style={lbl}>품번 (자동검색)</div><input value={newPurchase.code} onChange={e=>handleCodeInput(e.target.value,"purchase")} placeholder="품번 입력" style={inp}/></div>
                  <div><div style={lbl}>상품 선택</div>
                    <select value={newPurchase.productId} onChange={e=>{ const prod=products.find(p=>p.id===e.target.value); setNewPurchase(prev=>({...prev,productId:e.target.value,code:prod?.code||"",size:"",sizes:{},category:prod?.category||"신발"}));}} style={sel}>
                      <option value="">직접 입력</option>
                      {[...products].sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {!newPurchase.productId && <div><div style={lbl}>상품명</div><input value={newPurchase.manualName} onChange={e=>setNewPurchase(prev=>({...prev,manualName:e.target.value}))} style={inp}/></div>}
                  <div><div style={lbl}>결제수단</div>
                    <select value={newPurchase.payType} onChange={e=>setNewPurchase(prev=>({...prev,payType:e.target.value}))} style={sel}>
                      {PAYMENT_TYPES.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  {newPurchase.payType==="카드" && <div>
                    <div style={lbl}>카드 선택 <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowCardManager(true)}>카드 관리</span></div>
                    <select value={newPurchase.cardType} onChange={e=>{
                      const picked = cards.find(c=>c.name===e.target.value);
                      setNewPurchase(prev=>({...prev, cardType:e.target.value, cardNumber: picked?picked.number:prev.cardNumber}));
                    }} style={sel}>
                      <option value="">선택 안 함</option>
                      {cards.map(c=><option key={c.id} value={c.name}>{c.name} ({c.number})</option>)}
                    </select>
                  </div>}
                  {newPurchase.payType==="페이" && <div><div style={lbl}>페이 종류</div><select value={newPurchase.payBrand} onChange={e=>setNewPurchase(prev=>({...prev,payBrand:e.target.value}))} style={sel}>{PAY_TYPES.map(p=><option key={p} value={p}>{p}</option>)}</select></div>}
                  {newPurchase.payType==="계좌이체" && <div><div style={lbl}>은행</div><select value={newPurchase.bankType} onChange={e=>setNewPurchase(prev=>({...prev,bankType:e.target.value}))} style={sel}>{BANK_TYPES.map(b=><option key={b} value={b}>{b}</option>)}</select></div>}
                  {newPurchase.payType==="기타" && <div><div style={lbl}>결제방법 입력</div><input value={newPurchase.payOther} onChange={e=>setNewPurchase(prev=>({...prev,payOther:e.target.value}))} placeholder="직접 입력" style={inp}/></div>}
                  {[{key:"price",label:"매입가 (원)"},{key:"date",label:"매입일",type:"date"},{key:"place",label:"매입장소"}].map(f=>(
                    <div key={f.key}><div style={lbl}>{f.label}</div><input value={newPurchase[f.key]} onChange={e=>setNewPurchase(prev=>({...prev,[f.key]:e.target.value}))} type={f.type||"text"} style={inp}/></div>
                  ))}
                  <div>
                    <div style={lbl}>거래처 선택 (사업자번호 자동입력) <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowVendorManager(true)}>거래처 관리</span></div>
                    <select onChange={e=>{
                      const picked = vendors.find(v=>v.id===e.target.value);
                      if (picked) setNewPurchase(prev=>({...prev, bizNumber:picked.bizNumber}));
                    }} style={sel} defaultValue="">
                      <option value="">거래처 선택...</option>
                      {vendors.map(v=><option key={v.id} value={v.id}>{v.name} ({v.bizNumber})</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={newPurchase.memo} onChange={e=>setNewPurchase(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
                </div>
                {/* 9번: 사이즈별 수량 - 상품 선택 후에만 표시 */}
                {(newPurchase.productId || newPurchase.manualName) && (
                <div style={{marginTop:12}}>
                  <SizePicker data={{...newPurchase, category: newPurchase.category || (selectedProdP?.category || "신발")}} setter={setNewPurchase} showQty={true} toggleSize={toggleSize} setSizeQty={setSizeQty}/>
                </div>
                )}
                {newPurchase.price && Object.keys(newPurchase.sizes).length>0 && (() => {
                  const totalQty = Object.values(newPurchase.sizes).reduce((s,q)=>s+Number(q),0);
                  const {supply,vat} = calcVat(newPurchase.price, totalQty);
                  return <div style={{padding:"8px 12px",borderRadius:8,background:"#f8f9fa",fontSize:12,color:"#9ca3af"}}>총 {totalQty}개 · 공급가액 <span style={{color:"#111",fontWeight:700}}>{formatNum(Math.round(supply))}원</span> · 부가세 <span style={{color:"#b45309",fontWeight:700}}>{formatNum(Math.round(vat))}원</span></div>;
                })()}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button onClick={addPurchase} style={btn1}>저장</button>
                  <button onClick={()=>setShowAddPurchase(false)} style={btn2}>취소</button>
                </div>
              </div>
            )}

            {/* 8번: 수정 모달 - 1번: 매입 등록과 동일한 양식으로 통일 */}
            {editingPurchase && (
              <EditModal title="매입 수정"
                onSave={()=>{setPurchases(prev=>prev.map(p=>p.id===editingPurchase.id?{...editingPurchase,price:Number(editingPurchase.price)}:p));setEditingPurchase(null);}}
                onDelete={()=>{if(window.confirm("삭제할까요?")){moveToTrash(editingPurchase,"purchase");setEditingPurchase(null);}}}
                onClose={()=>setEditingPurchase(null)}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>상품명</div><input value={editingPurchase.productName||""} onChange={e=>setEditingPurchase(p=>({...p,productName:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>품번</div><input value={editingPurchase.productCode||""} onChange={e=>setEditingPurchase(p=>({...p,productCode:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>사이즈</div><input value={editingPurchase.size||""} onChange={e=>setEditingPurchase(p=>({...p,size:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>매입가</div><input value={editingPurchase.price||""} onChange={e=>setEditingPurchase(p=>({...p,price:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>수량</div><input value={editingPurchase.qty||""} onChange={e=>setEditingPurchase(p=>({...p,qty:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={editingPurchase.date||""} onChange={e=>setEditingPurchase(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>매입장소</div><input value={editingPurchase.place||""} onChange={e=>setEditingPurchase(p=>({...p,place:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>결제수단</div>
                    <select value={editingPurchase.payType||"카드"} onChange={e=>setEditingPurchase(p=>({...p,payType:e.target.value}))} style={sel}>
                      {PAYMENT_TYPES.map(pt=><option key={pt} value={pt}>{pt}</option>)}
                    </select>
                  </div>
                  {editingPurchase.payType==="카드" && <div style={{gridColumn:"1 / -1"}}>
                    <div style={lbl}>카드 선택 <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowCardManager(true)}>카드 관리</span></div>
                    <select value={editingPurchase.cardType||""} onChange={e=>{
                      const picked = cards.find(c=>c.name===e.target.value);
                      setEditingPurchase(p=>({...p, cardType:e.target.value, cardNumber: picked?picked.number:p.cardNumber}));
                    }} style={sel}>
                      <option value="">선택 안 함</option>
                      {cards.map(c=><option key={c.id} value={c.name}>{c.name} ({c.number})</option>)}
                    </select>
                  </div>}
                  {editingPurchase.payType==="페이" && <div><div style={lbl}>페이 종류</div><select value={editingPurchase.payBrand||""} onChange={e=>setEditingPurchase(p=>({...p,payBrand:e.target.value}))} style={sel}>{PAY_TYPES.map(pb=><option key={pb} value={pb}>{pb}</option>)}</select></div>}
                  {editingPurchase.payType==="계좌이체" && <div><div style={lbl}>은행</div><select value={editingPurchase.bankType||""} onChange={e=>setEditingPurchase(p=>({...p,bankType:e.target.value}))} style={sel}>{BANK_TYPES.map(b=><option key={b} value={b}>{b}</option>)}</select></div>}
                  {editingPurchase.payType==="기타" && <div><div style={lbl}>결제방법 입력</div><input value={editingPurchase.payOther||""} onChange={e=>setEditingPurchase(p=>({...p,payOther:e.target.value}))} style={inp}/></div>}
                  <div style={{gridColumn:"1 / -1"}}>
                    <div style={lbl}>거래처 선택 (사업자번호 자동입력) <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowVendorManager(true)}>거래처 관리</span></div>
                    <select value={vendors.find(v=>v.bizNumber===editingPurchase.bizNumber)?.id || ""} onChange={e=>{
                      const picked = vendors.find(v=>v.id===e.target.value);
                      setEditingPurchase(p=>({...p, bizNumber: picked ? picked.bizNumber : ""}));
                    }} style={sel}>
                      <option value="">거래처 선택...</option>
                      {vendors.map(v=><option key={v.id} value={v.id}>{v.name} ({v.bizNumber})</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={editingPurchase.memo||""} onChange={e=>setEditingPurchase(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}

            {purchases.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>매입 내역 없음</div>
              : !selectedPurchaseMonth ? (() => {
                const monthGroups = purchases.reduce((acc,p)=>{
                  const month = p.date.slice(0,7);
                  if (!acc[month]) acc[month] = { items:[], total:0 };
                  acc[month].items.push(p);
                  acc[month].total += Number(p.price)*Number(p.qty||1);
                  return acc;
                }, {});
                return Object.entries(monthGroups).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,mg])=>(
                  <div key={month} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedPurchaseMonth(month)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>{month}</div><div style={{fontSize:12,color:"#9ca3af"}}>{mg.items.length}건</div></div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontWeight:700,fontSize:15,color:"#d97706"}}>{formatNum(mg.total)}원</div><span style={{color:"#9ca3af"}}>▶</span></div>
                    </div>
                  </div>
                ));
              })()
              : (() => {
                const monthItems = purchases.filter(p=>p.date.slice(0,7)===selectedPurchaseMonth);
                const grouped = [...monthItems].sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,p)=>{
                  if (!acc[p.date]) acc[p.date] = {};
                  const key = p.productId || p.manualName || p.productName;
                  if (!acc[p.date][key]) acc[p.date][key] = [];
                  acc[p.date][key].push(p);
                  return acc;
                }, {});
                return (<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <button onClick={()=>setSelectedPurchaseMonth(null)} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                  <div style={{fontWeight:700,fontSize:15}}>{selectedPurchaseMonth}</div>
                </div>
                {Object.entries(grouped).map(([date, productGroups]) => {
                  const dayTotal = Object.values(productGroups).flat().reduce((s,p)=>s+Number(p.price)*Number(p.qty||1),0);
                  return (
                    <div key={date} style={{marginBottom:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#6b7280",marginBottom:8,padding:"6px 12px",background:"#f3f4f6",borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                        <span>{date}</span>
                        <span style={{color:"#d97706"}}>합계 {formatNum(dayTotal)}원</span>
                      </div>
                      {Object.entries(productGroups).map(([key, items]) => {
                        const prod = products.find(x=>x.id===items[0].productId);
                        const totalQty = items.reduce((s,p)=>s+Number(p.qty||1),0);
                        const totalAmt = items.reduce((s,p)=>s+Number(p.price)*Number(p.qty||1),0);
                        const {supply,vat} = calcVat(totalAmt/totalQty, totalQty);
                        const sizes = items.map(p=>p.size).filter(Boolean).join(", ");
                        return (
                          <div key={key} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setEditingPurchase({...items[0]})}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                {prod?.image && <img src={prod.image} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"contain",background:"#f3f4f6"}}/>}
                                <div>
                                  <div style={{fontWeight:700,fontSize:17}}>{items[0].productName} {sizes && <span style={{color:"#6d28d9"}}>{sizes}mm</span>}</div>
                                  <div style={{fontSize:13,color:"#6b7280",marginTop:2}}>품번: {items[0].productCode||"-"} · 총 {totalQty}개 · {items[0].place||"-"}</div>
                                  <div style={{fontSize:12,color:"#6b7280"}}>
                                    {items[0].payType}
                                    {items[0].payType==="카드"?` (${items[0].cardType})`:""}
                                    {items[0].payType==="페이"?` (${items[0].payBrand})`:""}
                                    {items[0].payType==="계좌이체"?` (${items[0].bankType})`:""}
                                    {items[0].payType==="기타"?` (${items[0].payOther})`:""}
                                  </div>
                                  <div style={{fontSize:12,color:"#b45309",marginTop:2}}>공급가액 {formatNum(Math.round(supply))}원 · 부가세 {formatNum(Math.round(vat))}원 · 합계 {formatNum(totalAmt)}원</div>
                                </div>
                              </div>
                              <div style={{fontSize:15,fontWeight:700,color:"#d97706",flexShrink:0}}>{formatNum(totalAmt)}원</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                </>);
              })()
            }
          </div>
        )}

        {/* 매출 */}
        {tab==="sales" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>매출 내역</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>총 매출금액 <span style={{color:"#6d28d9",fontWeight:700}}>{formatNum(totalSell)}원</span></div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input type="date" value={exportDateFrom} onChange={e=>setExportDateFrom(e.target.value)} style={{...inp,width:130,fontSize:12,padding:"6px 10px"}}/>
                <span style={{fontSize:12,color:"#9ca3af"}}>~</span>
                <input type="date" value={exportDateTo} onChange={e=>setExportDateTo(e.target.value)} style={{...inp,width:130,fontSize:12,padding:"6px 10px"}}/>
                <button onClick={()=>{ const filtered=[...sales].filter(s=>(!exportDateFrom||s.date>=exportDateFrom)&&(!exportDateTo||s.date<=exportDateTo)).sort((a,b)=>a.date.localeCompare(b.date)); const rows=[["날짜","품번","상품명","사이즈","플랫폼","판매가","수량","수수료","배송비","수익","수익율","메모"]]; filtered.forEach(s=>{const{profit,profitRate}=calcProfit(s);const fmt=n=>Number(n||0).toLocaleString("ko-KR");rows.push([s.date,s.productCode||"",s.productName||"",s.size||"",s.platform==="기타"?s.platformOther||"기타":s.platform,fmt(s.price),s.qty,fmt(s.fee||0),fmt(s.shipping||0),fmt(profit),profitRate.toFixed(1)+"%",s.memo||""]);}); exportToCSV(rows,"매출내역.csv"); }} style={{...btn2,fontSize:12}}>📥 엑셀</button>
                <button onClick={()=>setShowAddSale(true)} style={btn1}>+ 매출 추가</button>
              </div>
            </div>
            {showAddSale && (
              <div style={{...cs,border:"1px solid #6d28d9"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>매출 등록</div>
                {selectedProd?.image && <div style={{marginBottom:12}}><img src={selectedProd.image} alt="" style={{width:70,height:70,borderRadius:10,objectFit:"contain",background:"#f3f4f6",border:"2px solid #6d28d9"}}/></div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>품번 (자동검색)</div><input value={newSale.code} onChange={e=>handleCodeInput(e.target.value,"sale")} placeholder="품번 입력" style={inp}/></div>
                  <div><div style={lbl}>상품 선택</div>
                    <select value={newSale.productId} onChange={e=>setNewSale(prev=>({...prev,productId:e.target.value,code:products.find(p=>p.id===e.target.value)?.code||"",size:""}))} style={sel}>
                      <option value="">직접 입력</option>
                      {[...products].sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {!newSale.productId && <div><div style={lbl}>상품명</div><input value={newSale.manualName} onChange={e=>setNewSale(prev=>({...prev,manualName:e.target.value}))} style={inp}/></div>}
                  {newSale.productId && <div><div style={lbl}>사이즈</div>
                    <select value={newSale.size} onChange={e=>setNewSale(prev=>({...prev,size:e.target.value}))} style={sel}>
                      <option value="">선택</option>
                      {selectedProd && Object.keys(selectedProd.sizes).map(s=><option key={s} value={s}>{s}{(selectedProd.category||"신발")==="신발"?"mm":""} (재고 {calcStock(selectedProd.id,s)}개)</option>)}
                    </select>
                  </div>}
                  <div><div style={lbl}>플랫폼</div>
                    <select value={newSale.platform} onChange={e=>setNewSale(prev=>({...prev,platform:e.target.value}))} style={sel}>
                      {PLATFORMS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  {newSale.platform==="기타" && <div><div style={lbl}>판매 방법</div><input value={newSale.platformOther} onChange={e=>setNewSale(prev=>({...prev,platformOther:e.target.value}))} placeholder="번개장터, 직거래 등" style={inp}/></div>}
                  {[{key:"price",label:"판매가 (원)"},{key:"qty",label:"수량"},{key:"fee",label:"수수료 (원)"},{key:"shipping",label:"배송비 (원)"},{key:"date",label:"판매일",type:"date"}].map(f=>(
                    <div key={f.key}><div style={lbl}>{f.label}</div><input value={newSale[f.key]} onChange={e=>setNewSale(prev=>({...prev,[f.key]:e.target.value}))} type={f.type||"text"} style={inp}/></div>
                  ))}
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={newSale.memo} onChange={e=>setNewSale(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
                </div>
                {newSale.price && (() => {
                  const buyRecord=purchases.filter(p=>p.productId===newSale.productId&&p.size===newSale.size).slice(-1)[0];
                  const buyPrice=Number(buyRecord?.price||selectedProd?.releasePrice||0);
                  const fee=Number(newSale.fee||0), shipping=Number(newSale.shipping||0);
                  const profit=(Number(newSale.price)-buyPrice-fee-shipping)*(Number(newSale.qty)||1);
                  const profitRate=buyPrice>0?((Number(newSale.price)-buyPrice-fee-shipping)/buyPrice*100):0;
                  return <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#f8f9fa",fontSize:12,color:"#9ca3af"}}>수익 <span style={{color:profit>=0?"#059669":"#dc2626",fontWeight:700}}>{formatNum(profit)}원</span> · 수익율 <span style={{color:profitRate>=0?"#059669":"#dc2626",fontWeight:700}}>{profitRate.toFixed(1)}%</span></div>;
                })()}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button onClick={addSale} style={btn1}>저장</button>
                  <button onClick={()=>setShowAddSale(false)} style={btn2}>취소</button>
                </div>
              </div>
            )}

            {editingSale && (
              <EditModal title="매출 수정"
                onSave={()=>{setSales(prev=>prev.map(s=>s.id===editingSale.id?{...editingSale,price:Number(editingSale.price)}:s));setEditingSale(null);}}
                onDelete={()=>{if(window.confirm("삭제할까요?")){moveToTrash(editingSale,"sale");setEditingSale(null);}}}
                onClose={()=>setEditingSale(null)}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>상품명</div><input value={editingSale.productName||""} onChange={e=>setEditingSale(prev=>({...prev,productName:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>품번</div><input value={editingSale.productCode||""} onChange={e=>setEditingSale(prev=>({...prev,productCode:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>사이즈</div><input value={editingSale.size||""} onChange={e=>setEditingSale(prev=>({...prev,size:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>판매가</div><input value={editingSale.price||""} onChange={e=>setEditingSale(prev=>({...prev,price:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>수량</div><input value={editingSale.qty||""} onChange={e=>setEditingSale(prev=>({...prev,qty:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>수수료</div><input value={editingSale.fee||""} onChange={e=>setEditingSale(prev=>({...prev,fee:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>배송비</div><input value={editingSale.shipping||""} onChange={e=>setEditingSale(prev=>({...prev,shipping:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={editingSale.date||""} onChange={e=>setEditingSale(prev=>({...prev,date:e.target.value}))} style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={editingSale.memo||""} onChange={e=>setEditingSale(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}

            {sales.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>매출 내역 없음</div>
              : !selectedSaleMonth ? (() => {
                const monthGroups = sales.reduce((acc,s)=>{
                  const month = s.date.slice(0,7);
                  if (!acc[month]) acc[month] = { items:[], total:0, profit:0 };
                  acc[month].items.push(s);
                  acc[month].total += Number(s.price)*Number(s.qty||1);
                  acc[month].profit += calcProfit(s).profit;
                  return acc;
                }, {});
                return Object.entries(monthGroups).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,mg])=>(
                  <div key={month} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedSaleMonth(month)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>{month}</div><div style={{fontSize:12,color:"#9ca3af"}}>{mg.items.length}건</div></div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontWeight:700,fontSize:15,color:"#6d28d9"}}>{formatNum(mg.total)}원</div>
                          <div style={{fontSize:12,color:mg.profit>=0?"#059669":"#dc2626"}}>수익 {formatNum(mg.profit)}원</div>
                        </div>
                        <span style={{color:"#9ca3af"}}>▶</span>
                      </div>
                    </div>
                  </div>
                ));
              })()
              : (() => {
                const monthItems = sales.filter(s=>s.date.slice(0,7)===selectedSaleMonth);
                const grouped = [...monthItems].sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,s)=>{
                  if (!acc[s.date]) acc[s.date] = [];
                  acc[s.date].push(s);
                  return acc;
                }, {});
                return (<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <button onClick={()=>setSelectedSaleMonth(null)} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                  <div style={{fontWeight:700,fontSize:15}}>{selectedSaleMonth}</div>
                </div>
                {Object.entries(grouped).map(([date, items]) => {
                  const dayTotal = items.reduce((s,x)=>s+Number(x.price)*Number(x.qty||1),0);
                  const dayProfit = items.reduce((s,x)=>s+calcProfit(x).profit,0);
                  return (
                    <div key={date} style={{marginBottom:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#6b7280",marginBottom:8,padding:"6px 12px",background:"#f3f4f6",borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                        <span>{date}</span>
                        <span><span style={{color:"#6d28d9"}}>합계 {formatNum(dayTotal)}원</span> · <span style={{color:dayProfit>=0?"#059669":"#dc2626"}}>수익 {formatNum(dayProfit)}원</span></span>
                      </div>
                      {items.map(s => {
                        const prod = products.find(p=>p.id===s.productId);
                        const {profit, profitRate} = calcProfit(s);
                        return (
                          <div key={s.id} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setEditingSale({...s})}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                {prod?.image && <img src={prod.image} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"contain",background:"#f3f4f6"}}/>}
                                <div>
                                  <div style={{fontWeight:700,fontSize:17}}>{s.productName} {s.size && <span style={{color:"#6d28d9"}}>{s.size}</span>}</div>
                                  <div style={{fontSize:13,color:"#6b7280",marginTop:2}}>품번: {s.productCode||"-"} · {s.platform==="기타"?s.platformOther||"기타":s.platform} · {s.qty}개</div>
                                  <div style={{fontSize:12,color:"#6b7280"}}>수수료: {formatNum(s.fee||0)}원 · 배송비: {formatNum(s.shipping||0)}원</div>
                                  {s.inspectionFailed && <div style={{fontSize:12,color:"#dc2626",fontWeight:700,marginTop:2}}>⚠ 검수불통</div>}
                                  {s.memo && <div style={{fontSize:12,color:"#9ca3af"}}>메모: {s.memo}</div>}
                                </div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                <div style={{fontSize:15,fontWeight:700}}>{formatNum(s.price*s.qty)}원</div>
                                <div style={{fontSize:12,color:profit>=0?"#059669":"#dc2626"}}>수익 {formatNum(profit)}원</div>
                                <div style={{fontSize:12,color:profitRate>=0?"#059669":"#dc2626"}}>{profitRate.toFixed(1)}%</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                </>);
              })()
            }
          </div>
        )}

        {/* 검수 */}
        {tab==="inspection" && (
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>검수</div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>판매 후 검수불통 발생 시, 할인판매(매출액 10% 자동 할인) 또는 거래실패(매출 취소·재고 자동 회수) 처리</div>

            <div style={{...cs,marginBottom:16}}>
              <div style={lbl}>판매 내역에서 상품 선택 (품번 또는 상품명으로 검색)</div>
              <input value={inspectionSaleSearch} onChange={e=>{setInspectionSaleSearch(e.target.value);setSelectedInspectionSaleId("");setInspectionReason("");setInspectionDate(new Date().toISOString().slice(0,10));}} placeholder="품번 또는 상품명 입력" style={inp}/>
              {inspectionSaleSearch && (() => {
                const inspectedSaleIds = new Set(inspections.map(i=>i.saleId));
                const kw = inspectionSaleSearch.trim().toLowerCase();
                const matched = sales.filter(s =>
                  !inspectedSaleIds.has(s.id) &&
                  ((s.productCode && s.productCode.toLowerCase().includes(kw)) || (s.productName && s.productName.toLowerCase().includes(kw)))
                ).sort((a,b)=>b.date.localeCompare(a.date));
                if (matched.length===0) return <div style={{padding:"10px 0",color:"#9ca3af",fontSize:13}}>검수 대상(검수 미처리 판매 내역) 검색 결과가 없어요</div>;
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
                    {matched.map(s=>{
                      const selected = selectedInspectionSaleId===s.id;
                      const prod = products.find(p=>p.id===s.productId);
                      return (
                        <div key={s.id} onClick={()=>{setSelectedInspectionSaleId(s.id);setInspectionReason("");}}
                          style={{padding:"10px 14px",borderRadius:8,border:selected?"2px solid #6d28d9":"1px solid #e5e7eb",background:selected?"#ede9fe":"#f9fafb",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:10}}>
                          {prod?.image ? <img src={prod.image} alt="" style={{width:36,height:36,borderRadius:6,objectFit:"contain",background:"#fff",flexShrink:0}}/> : <div style={{width:36,height:36,borderRadius:6,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>👟</div>}
                          <div>
                            <span style={{fontWeight:600}}>{s.date}</span> · {s.productName} · 품번 {s.productCode||"-"} · {s.size} · {s.qty}개 · {formatNum(s.price)}원 · {s.platform}
                            {selected && <span style={{color:"#6d28d9",marginLeft:8,fontWeight:700}}>✓ 선택됨</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {selectedInspectionSaleId && (() => {
              const sale = sales.find(s=>s.id===selectedInspectionSaleId);
              if (!sale) return null;
              const prod = products.find(p=>p.id===sale.productId);
              const discounted = Math.round(Number(sale.price)*0.9);
              return (
                <div style={{...cs,border:"1px solid #6d28d9",marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    {prod?.image ? <img src={prod.image} alt="" style={{width:52,height:52,borderRadius:8,objectFit:"contain",background:"#f3f4f6",flexShrink:0}}/> : <div style={{width:52,height:52,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:22}}>👟</div>}
                    <div style={{fontSize:13,fontWeight:700}}>{sale.productName} · {sale.size} · 현재 매출액 {formatNum(sale.price)}원</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div><div style={lbl}>검수일</div><input type="date" value={inspectionDate} onChange={e=>setInspectionDate(e.target.value)} style={inp}/></div>
                    <div><div style={lbl}>사유 (선택)</div><input value={inspectionReason} onChange={e=>setInspectionReason(e.target.value)} placeholder="예: 사이즈 오기입, 가품 의심, 박스 손상 등" style={inp}/></div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={()=>{
                      if(window.confirm(`할인판매로 처리할까요?\n매출액이 ${formatNum(sale.price)}원 → ${formatNum(discounted)}원(10% 할인)으로 자동 수정됩니다.`)) processInspection(sale,"할인판매",inspectionReason,inspectionDate);
                    }} style={btn2}>💸 할인판매 (10% 할인 → {formatNum(discounted)}원)</button>
                    <button onClick={()=>{
                      if(window.confirm("거래실패로 처리할까요?\n매출 내역은 삭제되지 않고 '검수불통'으로 표시되며, 해당 재고는 다시 복원됩니다.")) processInspection(sale,"거래실패",inspectionReason,inspectionDate);
                    }} style={btnDanger}>❌ 거래실패 (재고 회수)</button>
                  </div>
                </div>
              );
            })()}

            <div style={{fontSize:13,fontWeight:700,color:"#6b7280",marginBottom:8}}>검수 처리 내역</div>
            {inspections.length===0 ? <div style={{...cs,textAlign:"center",color:"#9ca3af"}}>처리된 검수 내역이 없어요</div>
              : !selectedInspectionMonth ? (() => {
                const monthGroups = inspections.reduce((acc,i)=>{
                  const month = i.date.slice(0,7);
                  if (!acc[month]) acc[month] = [];
                  acc[month].push(i);
                  return acc;
                }, {});
                return Object.entries(monthGroups).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,items])=>(
                  <div key={month} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedInspectionMonth(month)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>{month}</div><div style={{fontSize:12,color:"#9ca3af"}}>{items.length}건</div></div>
                      <span style={{color:"#9ca3af"}}>▶</span>
                    </div>
                  </div>
                ));
              })()
              : (<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <button onClick={()=>setSelectedInspectionMonth(null)} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                  <div style={{fontWeight:700,fontSize:15}}>{selectedInspectionMonth}</div>
                </div>
                {[...inspections].filter(i=>i.date.slice(0,7)===selectedInspectionMonth).sort((a,b)=>b.date.localeCompare(a.date)).map(i=>{
                  const prod = products.find(p=>p.id===i.productId);
                  return (
                  <div key={i.id} style={{...cs,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,cursor:"pointer"}} onClick={()=>setEditingInspection({...i})}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {prod?.image ? <img src={prod.image} alt="" style={{width:40,height:40,borderRadius:8,objectFit:"contain",background:"#f3f4f6",flexShrink:0}}/> : <div style={{width:40,height:40,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>👟</div>}
                      <div>
                        <div style={{fontWeight:600,fontSize:14}}>{i.productName} · {i.size} · {i.qty}개</div>
                        <div style={{fontSize:12,color:"#9ca3af"}}>{i.date} · 품번 {i.productCode||"-"}</div>
                        {i.reason && <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>사유: {i.reason}</div>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,color:i.result==="할인판매"?"#d97706":"#dc2626"}}>{i.result} <span style={{fontSize:11,color:"#9ca3af"}}>✏️</span></div>
                      {i.result==="할인판매" && <div style={{fontSize:12,color:"#9ca3af"}}>{formatNum(i.originalPrice)}원 → {formatNum(i.newPrice)}원</div>}
                    </div>
                  </div>
                  );
                })}
              </>)
            }

            {editingInspection && (
              <EditModal title="검수 처리 수정"
                onSave={saveEditedInspection}
                onDelete={()=>deleteInspection(editingInspection)}
                onClose={()=>setEditingInspection(null)}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>상품명</div><input value={editingInspection.productName||""} disabled style={{...inp,background:"#f3f4f6"}}/></div>
                  <div><div style={lbl}>사이즈</div><input value={editingInspection.size||""} disabled style={{...inp,background:"#f3f4f6"}}/></div>
                  <div><div style={lbl}>결과</div>
                    <select value={editingInspection.result} onChange={e=>setEditingInspection(p=>({...p,result:e.target.value}))} style={sel}>
                      <option value="할인판매">할인판매 (10% 할인)</option>
                      <option value="거래실패">거래실패 (재고 회수)</option>
                    </select>
                  </div>
                  <div><div style={lbl}>날짜</div><input type="date" value={editingInspection.date||""} onChange={e=>setEditingInspection(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>사유</div><input value={editingInspection.reason||""} onChange={e=>setEditingInspection(p=>({...p,reason:e.target.value}))} placeholder="예: 사이즈 오기입, 가품 의심, 박스 손상 등" style={inp}/></div>
                </div>
              </EditModal>
            )}
          </div>
        )}

        {/* 재고현황 */}
        {tab==="stock" && (
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>재고 현황</div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:12}}>총 재고 <span style={{color:"#6d28d9",fontWeight:700}}>{formatNum(totalStockQty)}개</span> · 총 재고금액(매입가 기준) <span style={{color:"#6d28d9",fontWeight:700}}>{formatNum(Math.round(totalStockValue))}원</span></div>
            <div style={cs}>
              <div style={lbl}>품번 검색</div>
              <input value={stockCodeSearch} onChange={e=>{setStockCodeSearch(e.target.value);setSelectedStockBrand(null);setSelectedStockCategory(null);}}
                placeholder="품번 입력 후 검색" style={{...inp,marginBottom:0}}/>
            </div>
            {(() => {
              const filtered = stockCodeSearch
                ? products.filter(p=>p.code&&normalizeCode(p.code).includes(normalizeCode(stockCodeSearch)))
                : products;
              const withStock = filtered.map(p=>({
                ...p,
                stockList: Object.keys(p.sizes).map(size=>({size,stock:calcStock(p.id,size)})).filter(x=>x.stock>0)
              })).filter(p=>p.stockList.length>0);

              if (withStock.length===0) return <div style={{...cs,textAlign:"center",color:"#9ca3af"}}>{stockCodeSearch?"검색 결과 없음":"보유 재고 없음"}</div>;

              // 품번으로 검색 중이면 계층 없이 바로 결과 표시
              const useHierarchy = !stockCodeSearch;

              // 1단계: 브랜드 미선택 -> 브랜드별 합계
              if (useHierarchy && !selectedStockBrand) {
                const byBrand = withStock.reduce((acc,p)=>{
                  const b = p.brand || "기타";
                  if (!acc[b]) acc[b] = { items:[], qty:0 };
                  acc[b].items.push(p);
                  acc[b].qty += p.stockList.reduce((s,x)=>s+x.stock,0);
                  return acc;
                }, {});
                return Object.entries(byBrand).sort((a,b)=>a[0].localeCompare(b[0],"ko")).map(([brand,bg])=>(
                  <div key={brand} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedStockBrand(brand)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontWeight:700,fontSize:15}}>{brand}</div><div style={{fontSize:12,color:"#9ca3af"}}>{bg.items.length}개 품목</div></div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontWeight:700,fontSize:15,color:"#6d28d9"}}>{bg.qty}개</div><span style={{color:"#9ca3af"}}>▶</span></div>
                    </div>
                  </div>
                ));
              }

              // 2단계: 브랜드는 선택했지만 카테고리 미선택 -> 그 브랜드 안에서 카테고리별 합계
              if (useHierarchy && selectedStockBrand && !selectedStockCategory) {
                const brandItems = withStock.filter(p=>(p.brand||"기타")===selectedStockBrand);
                const byCategory = brandItems.reduce((acc,p)=>{
                  const c = p.category || "기타";
                  if (!acc[c]) acc[c] = { items:[], qty:0 };
                  acc[c].items.push(p);
                  acc[c].qty += p.stockList.reduce((s,x)=>s+x.stock,0);
                  return acc;
                }, {});
                return (<>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <button onClick={()=>setSelectedStockBrand(null)} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                    <div style={{fontWeight:700,fontSize:15}}>{selectedStockBrand}</div>
                  </div>
                  {CATEGORIES.filter(c=>byCategory[c]).map(cat=>{
                    const cg = byCategory[cat];
                    return (
                      <div key={cat} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedStockCategory(cat)}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div><div style={{fontWeight:700,fontSize:15}}>{cat}</div><div style={{fontSize:12,color:"#9ca3af"}}>{cg.items.length}개 품목</div></div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontWeight:700,fontSize:15,color:"#6d28d9"}}>{cg.qty}개</div><span style={{color:"#9ca3af"}}>▶</span></div>
                        </div>
                      </div>
                    );
                  })}
                </>);
              }

              // 3단계 (또는 검색 중): 상품별 상세 목록
              const detailList = useHierarchy
                ? withStock.filter(p=>(p.brand||"기타")===selectedStockBrand && (p.category||"기타")===selectedStockCategory)
                : withStock;

              return (<>
                {useHierarchy && (
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <button onClick={()=>setSelectedStockCategory(null)} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                    <div style={{fontWeight:700,fontSize:15}}>{selectedStockBrand} · {selectedStockCategory}</div>
                  </div>
                )}
                {detailList.sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(p=>{
                const totalStock = p.stockList.reduce((s,x)=>s+x.stock,0);
                const isExpanded = expandedStockId === p.id;
                // 11번: 평소엔 간략히, 클릭하면 매입/매출/반품 상세 표시
                return (
                  <div key={p.id} style={cs}>
                    <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}
                      onClick={()=>setExpandedStockId(isExpanded ? null : p.id)}>
                      {p.image ? <img src={p.image} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"contain",background:"#f3f4f6",flexShrink:0}}/> : <div style={{width:44,height:44,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>👟</div>}
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:15}}>{p.name}</div>
                        <div style={{fontSize:12,color:"#9ca3af"}}>품번: {p.code||"-"} · {p.brand}</div>
                      </div>
                      <div style={{fontWeight:700,fontSize:15,color:"#6d28d9"}}>{totalStock}개</div>
                      <span style={{fontSize:12,color:"#9ca3af",marginLeft:6}}>{isExpanded?"▲":"▼"}</span>
                    </div>

                    {isExpanded && (() => {
                      const pPurchases = purchases.filter(x=>x.productId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
                      const pSales = sales.filter(x=>x.productId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
                      const pReturns = returns.filter(x=>x.productId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
                      // 12번: 이 상품의 평균 매입가/매출가 및 누적 수익 요약
                      const avgBuyPrice = pPurchases.length ? pPurchases.reduce((s,x)=>s+Number(x.price||0),0)/pPurchases.length : 0;
                      const validSales = pSales.filter(x=>!x.inspectionFailed);
                      const avgSellPrice = validSales.length ? validSales.reduce((s,x)=>s+Number(x.price||0),0)/validSales.length : 0;
                      const pProfit = validSales.reduce((s,x)=>s+calcProfit(x).profit,0);
                      return (
                        <div style={{marginTop:12,borderTop:"1px solid #f3f4f6",paddingTop:12}}>
                          {(pPurchases.length>0 || pSales.length>0) && (
                            <div style={{fontSize:12,color:"#6b7280",background:"#f9fafb",borderRadius:8,padding:"8px 12px",marginBottom:12}}>
                              평균 매입가 <span style={{color:"#d97706",fontWeight:700}}>{formatNum(Math.round(avgBuyPrice))}원</span>
                              {" · "}평균 매출가 <span style={{color:"#6d28d9",fontWeight:700}}>{formatNum(Math.round(avgSellPrice))}원</span>
                              {" · "}누적 수익 <span style={{color:pProfit>=0?"#059669":"#dc2626",fontWeight:700}}>{formatNum(Math.round(pProfit))}원</span>
                            </div>
                          )}
                          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                            {p.stockList.sort((a,b)=>a.size-b.size).map(x=>(
                              <div key={x.size} style={{padding:"6px 14px",borderRadius:8,background:"#ede9fe",fontSize:14}}>
                                <span style={{color:"#6b7280"}}>{x.size}mm</span>
                                <span style={{color:"#6d28d9",fontWeight:700,marginLeft:6}}>{x.stock}개</span>
                              </div>
                            ))}
                          </div>
                          {pPurchases.length>0 && (
                            <div style={{marginBottom:10}}>
                              <div style={{fontSize:13,fontWeight:700,color:"#d97706",marginBottom:6}}>매입 내역</div>
                              {pPurchases.map(x=>(
                                <div key={x.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}>
                                  <span style={{color:"#6b7280"}}>{x.date} · {x.size}mm · {x.qty}개</span>
                                  <span style={{fontWeight:600,color:"#d97706"}}>{formatNum(x.price*x.qty)}원</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {pSales.length>0 && (
                            <div style={{marginBottom:10}}>
                              <div style={{fontSize:13,fontWeight:700,color:"#059669",marginBottom:6}}>매출 내역</div>
                              {pSales.map(x=>(
                                <div key={x.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}>
                                  <span style={{color:"#6b7280"}}>{x.date} · {x.size}mm · {x.qty}개 · {x.platform}</span>
                                  <span style={{fontWeight:600,color:"#059669"}}>{formatNum(x.price*x.qty)}원</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {pReturns.length>0 && (
                            <div>
                              <div style={{fontSize:13,fontWeight:700,color:"#dc2626",marginBottom:6}}>반품 내역</div>
                              {pReturns.map(x=>(
                                <div key={x.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}>
                                  <span style={{color:"#6b7280"}}>{x.date} · {x.size}mm · {x.qty}개{x.reason?` · ${x.reason}`:""}</span>
                                  <span style={{fontWeight:600,color:"#dc2626"}}>{formatNum(calcReturnAmount(x))}원</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
                })}
              </>);
            })()}
          </div>
        )}

        {/* 반품 */}
        {tab==="returns" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:15,fontWeight:700}}>반품 내역</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>총 반품 <span style={{color:"#dc2626",fontWeight:700}}>{formatNum(returns.reduce((s,r)=>s+Number(r.qty||1),0))}개</span> · 총 반품금액 <span style={{color:"#dc2626",fontWeight:700}}>{formatNum(totalReturnAmount)}원</span></div>
              </div>
              <button onClick={()=>setShowAddReturn(true)} style={btn1}>+ 반품 추가</button>
            </div>

            {/* 반품 등록 폼 */}
            {showAddReturn && (
              <div style={{...cs,border:"2px solid #6d28d9"}}>
                <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>반품 등록</div>
                <div style={{marginBottom:12}}>
                  <div style={lbl}>품번 입력 (매입 내역 자동 검색)</div>
                  <input value={returnCodeSearch} onChange={e=>setReturnCodeSearch(e.target.value)} placeholder="품번 입력" style={inp}/>
                </div>
                {returnCodeSearch && (() => {
                  const matchedProd = products.find(p=>p.code&&normalizeCode(p.code)===normalizeCode(returnCodeSearch));
                  const matchedPurchases = matchedProd ? purchases.filter(p=>p.productId===matchedProd.id && calcStock(matchedProd.id, p.size) > 0).sort((a,b)=>b.date.localeCompare(a.date)) : [];
                  if (!matchedProd) return <div style={{padding:"10px",color:"#dc2626",fontSize:13}}>등록된 품번을 찾을 수 없어요</div>;
                  if (matchedPurchases.length===0) return <div style={{padding:"10px",color:"#9ca3af",fontSize:13}}>재고가 남아있는 매입 내역이 없어요</div>;
                  // 15번: 선택된 매입 건을 사이즈별로 묶어, 수량을 직접 조정할 수 있는 미리보기 계산
                  const selectedIds = newReturn.purchaseIds||[];
                  const selectedPurchases = matchedPurchases.filter(p=>selectedIds.includes(p.id));
                  const bySize = {};
                  selectedPurchases.forEach(p=>{
                    if (!bySize[p.size]) bySize[p.size] = { size:p.size, maxQty:0 };
                    bySize[p.size].maxQty += Number(p.qty||1);
                  });
                  return (
                    <div>
                      <div style={lbl}>매입 내역 선택 (복수 선택 가능, 서로 다른 사이즈도 함께 선택 가능)</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                        {matchedPurchases.map(p=>{
                          const selected = (newReturn.purchaseIds||[]).includes(p.id);
                          return (
                            <div key={p.id} onClick={()=>setNewReturn(prev=>{
                              const ids = prev.purchaseIds||[];
                              const newIds = selected ? ids.filter(id=>id!==p.id) : [...ids, p.id];
                              return {...prev, productId:matchedProd.id, productName:matchedProd.name, productCode:matchedProd.code, purchaseIds:newIds};
                            })}
                              style={{padding:"10px 14px",borderRadius:8,border:selected?"2px solid #6d28d9":"1px solid #e5e7eb",background:selected?"#ede9fe":"#f9fafb",cursor:"pointer",fontSize:13}}>
                              <span style={{fontWeight:600}}>{p.date}</span> · {p.size} · {p.qty}개 · {formatNum(p.price)}원 · {p.place||"-"}
                              {selected && <span style={{color:"#6d28d9",marginLeft:8,fontWeight:700}}>✓ 선택됨</span>}
                            </div>
                          );
                        })}
                      </div>
                      {Object.keys(bySize).length>0 && (
                        <div style={{marginBottom:12}}>
                          <div style={lbl}>사이즈별 반품 수량 (일부만 반품하는 경우 직접 줄여서 입력)</div>
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {Object.values(bySize).map(g=>(
                              <div key={g.size} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f9fafb",borderRadius:8}}>
                                <span style={{fontSize:13,fontWeight:600,flex:1}}>{g.size} (매입 {g.maxQty}개)</span>
                                <input type="number" min="1" max={g.maxQty}
                                  value={returnQtyBySize[g.size] ?? g.maxQty}
                                  onChange={e=>{
                                    let v = Number(e.target.value)||1;
                                    if (v>g.maxQty) v=g.maxQty;
                                    if (v<1) v=1;
                                    setReturnQtyBySize(prev=>({...prev,[g.size]:v}));
                                  }}
                                  style={{...inp,width:70,padding:"6px 10px"}}/>
                                <span style={{fontSize:12,color:"#9ca3af"}}>개</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>상품명</div><input value={newReturn.productName} onChange={e=>setNewReturn(p=>({...p,productName:e.target.value}))} placeholder="상품명 입력" style={inp}/></div>
                  <div><div style={lbl}>품번</div><input value={newReturn.productCode} onChange={e=>setNewReturn(p=>({...p,productCode:e.target.value}))} placeholder="품번 입력" style={inp}/></div>
                  {(newReturn.purchaseIds||[]).length===0 && (<>
                    <div><div style={lbl}>사이즈</div><input value={newReturn.size} onChange={e=>setNewReturn(p=>({...p,size:e.target.value}))} placeholder="사이즈" style={inp}/></div>
                    <div><div style={lbl}>반품 수량</div><input type="number" min="1" value={newReturn.qty} onChange={e=>setNewReturn(p=>({...p,qty:e.target.value}))} style={inp}/></div>
                  </>)}
                  <div><div style={lbl}>반품일</div><input type="date" value={newReturn.date} onChange={e=>setNewReturn(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>반품 사유</div><input value={newReturn.reason} onChange={e=>setNewReturn(p=>({...p,reason:e.target.value}))} placeholder="예: 불량, 사이즈 오류" style={inp}/></div>
                  <div><div style={lbl}>반품 배송비 (원)</div><input type="number" min="0" value={newReturn.shippingFee} onChange={e=>setNewReturn(p=>({...p,shippingFee:e.target.value}))} placeholder="발생 시 입력 (경비로 자동 처리)" style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={newReturn.memo} onChange={e=>setNewReturn(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:14}}>
                  <button onClick={()=>{
                    const selectedIds = newReturn.purchaseIds||[];
                    if (selectedIds.length>0) {
                      // 사이즈별로 묶어 각각 별도 반품 건으로 저장. 수량은 직접 입력한 값(returnQtyBySize) 우선 사용 -> 일부 반품 대응
                      const selectedPurchases = purchases.filter(p=>selectedIds.includes(p.id));
                      const bySize = {};
                      selectedPurchases.forEach(p=>{
                        if (!bySize[p.size]) bySize[p.size] = { size:p.size, maxQty:0, purchaseIds:[] };
                        bySize[p.size].maxQty += Number(p.qty||1);
                        bySize[p.size].purchaseIds.push(p.id);
                      });
                      const newRecords = Object.values(bySize).map(g => ({
                        id: generateId(),
                        productId: newReturn.productId,
                        productName: newReturn.productName,
                        productCode: newReturn.productCode,
                        size: g.size,
                        qty: returnQtyBySize[g.size] ?? g.maxQty,
                        purchaseIds: g.purchaseIds,
                        date: newReturn.date,
                        reason: newReturn.reason,
                        memo: newReturn.memo,
                      }));
                      setReturns(prev=>[...prev, ...newRecords]);
                    } else {
                      if(!newReturn.productName){alert("상품명을 입력해주세요!");return;}
                      setReturns(prev=>[...prev,{...newReturn,id:generateId(),qty:Number(newReturn.qty)||1}]);
                    }
                    // 반품 배송비가 있으면 경비로 자동 등록
                    if (Number(newReturn.shippingFee) > 0) {
                      setExpenses(prev=>[...prev, {
                        id: generateId(), type: "반품배송비", itemName: `${newReturn.productName} 반품 배송비`,
                        qty: "1", purchasePlace: "", amount: Number(newReturn.shippingFee),
                        date: newReturn.date, memo: `반품 배송비 (${newReturn.productCode||"-"})`,
                      }]);
                    }
                    setReturnCodeSearch(""); setNewReturn({...emptyReturn}); setReturnQtyBySize({}); setShowAddReturn(false);
                  }} style={btn1}>저장</button>
                  <button onClick={()=>{setShowAddReturn(false);setReturnCodeSearch("");setNewReturn({...emptyReturn});setReturnQtyBySize({});}} style={btn2}>취소</button>
                </div>
              </div>
            )}

            {/* 반품 수정 모드 */}
            {editingReturn && (
              <EditModal title="반품 수정"
                onSave={()=>{setReturns(prev=>prev.map(r=>r.id===editingReturn.id?{...editingReturn,qty:Number(editingReturn.qty)||1}:r));setEditingReturn(null);}}
                onDelete={()=>{if(window.confirm("삭제?")){moveToTrash(editingReturn,"return");setReturns(prev=>prev.filter(r=>r.id!==editingReturn.id));setEditingReturn(null);}}}
                onClose={()=>setEditingReturn(null)}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>상품명</div><input value={editingReturn.productName||""} onChange={e=>setEditingReturn(p=>({...p,productName:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>품번</div><input value={editingReturn.productCode||""} onChange={e=>setEditingReturn(p=>({...p,productCode:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>사이즈</div><input value={editingReturn.size||""} onChange={e=>setEditingReturn(p=>({...p,size:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>수량</div><input value={editingReturn.qty||""} onChange={e=>setEditingReturn(p=>({...p,qty:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>반품일</div><input type="date" value={editingReturn.date||""} onChange={e=>setEditingReturn(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>사유</div><input value={editingReturn.reason||""} onChange={e=>setEditingReturn(p=>({...p,reason:e.target.value}))} style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={editingReturn.memo||""} onChange={e=>setEditingReturn(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}

            {returns.length===0 ? <div style={{...cs,textAlign:"center",color:"#9ca3af"}}>반품 내역이 없어요</div>
              : (() => {
                // 3번: 일자별로 먼저 그룹핑 (평소엔 간략히 표시)
                const dateGroups = [...returns].sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,r)=>{
                  if (!acc[r.date]) acc[r.date] = [];
                  acc[r.date].push(r);
                  return acc;
                }, {});
                return Object.entries(dateGroups).map(([date, items]) => {
                  const dayQty = items.reduce((s,r)=>s+Number(r.qty||1),0);
                  const dayAmount = items.reduce((s,r)=>s+calcReturnAmount(r),0);
                  const isExpanded = expandedReturnDate === date;
                  // 일자 안에서는 품목별로 다시 그룹핑 (펼쳤을 때 표시)
                  const productGroups = items.reduce((acc,r)=>{
                    const key = r.productId || r.productName;
                    if (!acc[key]) acc[key] = { productId:r.productId, productName:r.productName, productCode:r.productCode, items:[] };
                    acc[key].items.push(r);
                    return acc;
                  }, {});
                  return (
                    <div key={date} style={{...cs,marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                        onClick={()=>setExpandedReturnDate(isExpanded ? null : date)}>
                        <div style={{fontWeight:700,fontSize:15}}>{date}</div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:12,color:"#9ca3af"}}>{dayQty}개</span>
                          <span style={{fontWeight:700,fontSize:14,color:"#dc2626"}}>{formatNum(dayAmount)}원</span>
                          <span style={{fontSize:12,color:"#9ca3af"}}>{isExpanded?"▲":"▼"}</span>
                        </div>
                      </div>
                      {/* 23번: 펼치지 않아도 어떤 상품인지 바로 보이도록 이미지 미리보기 */}
                      <div style={{display:"flex",gap:6,marginTop:8,cursor:"pointer"}} onClick={()=>setExpandedReturnDate(isExpanded ? null : date)}>
                        {Object.values(productGroups).map(group => {
                          const prod = products.find(p=>p.id===group.productId);
                          return prod?.image
                            ? <img key={group.productId||group.productName} src={prod.image} alt="" title={group.productName} style={{width:36,height:36,borderRadius:6,objectFit:"contain",background:"#f3f4f6",flexShrink:0}}/>
                            : <div key={group.productId||group.productName} title={group.productName} style={{width:36,height:36,borderRadius:6,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>👟</div>;
                        })}
                      </div>
                      {isExpanded && (
                        <div style={{marginTop:10,borderTop:"1px solid #f3f4f6",paddingTop:10}}>
                          {Object.entries(productGroups).map(([key, group]) => {
                            const prod = products.find(p=>p.id===group.productId);
                            const groupQty = group.items.reduce((s,r)=>s+Number(r.qty||1),0);
                            return (
                              <div key={key} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid #f9fafb"}}>
                                {prod?.image ? <img src={prod.image} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"contain",background:"#f3f4f6",flexShrink:0}}/> : <div style={{width:44,height:44,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>👟</div>}
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:700,fontSize:14}}>{group.productName} <span style={{fontSize:12,color:"#9ca3af",fontWeight:400}}>· 품번 {group.productCode||"-"} · 총 {groupQty}개</span></div>
                                  {group.items.map(r=>(
                                    <div key={r.id} style={{fontSize:12,color:"#6b7280",marginTop:3,cursor:"pointer"}} onClick={()=>setEditingReturn({...r})}>
                                      {r.size && <span style={{color:"#6d28d9"}}>{r.size} </span>}{r.qty}개
                                      {r.reason && <span style={{color:"#dc2626"}}> · {r.reason}</span>}
                                      <span style={{color:"#d97706",marginLeft:6}}>{formatNum(calcReturnAmount(r))}원</span>
                                      <span style={{color:"#9ca3af",marginLeft:6}}>✏️</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            }
          </div>
        )}

        {/* 경비 */}
        {tab==="expenses" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:15,fontWeight:700}}>경비 내역</div>
              <button onClick={()=>setShowAddExpense(true)} style={btn1}>+ 경비 추가</button>
            </div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:14}}>총 경비 합계 <span style={{color:"#dc2626",fontWeight:700}}>{formatNum(totalExpenses)}원</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:14}}>
              {EXPENSE_TYPES.map(type=>{
                const total=expenses.filter(e=>e.type===type).reduce((s,e)=>s+Number(e.amount)*Number(e.qty||1),0);
                const isSelected = selectedExpenseType===type;
                return (
                  <div key={type} onClick={()=>{setSelectedExpenseType(isSelected?null:type);setExpandedExpenseDate(null);}}
                    style={{background:isSelected?"#ede9fe":"#fff",borderRadius:10,padding:"12px 14px",border:isSelected?"2px solid #6d28d9":"1px solid #e5e7eb",cursor:"pointer"}}>
                    <div style={{fontSize:11,color:"#6b7280",marginBottom:4}}>{type}</div>
                    <div style={{fontSize:15,fontWeight:700,color:"#dc2626"}}>{formatNum(total)}원</div>
                  </div>
                );
              })}
            </div>
            {selectedExpenseType && (
              <div style={{fontSize:12,color:"#6d28d9",background:"#ede9fe",borderRadius:8,padding:"8px 12px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span><b>{selectedExpenseType}</b> 항목만 보는 중</span>
                <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>setSelectedExpenseType(null)}>전체보기</span>
              </div>
            )}
            {showAddExpense && (
              <div style={{...cs,border:"1px solid #6d28d9"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>경비 등록</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>종류</div><select value={newExpense.type} onChange={e=>setNewExpense(prev=>({...prev,type:e.target.value}))} style={sel}>{EXPENSE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><div style={lbl}>품명</div><input value={newExpense.itemName} onChange={e=>setNewExpense(prev=>({...prev,itemName:e.target.value}))} placeholder="품명 입력" style={inp}/></div>
                  <div><div style={lbl}>구매처</div><input value={newExpense.purchasePlace} onChange={e=>setNewExpense(prev=>({...prev,purchasePlace:e.target.value}))} placeholder="구매처 입력" style={inp}/></div>
                  <div><div style={lbl}>수량</div><input value={newExpense.qty} onChange={e=>setNewExpense(prev=>({...prev,qty:e.target.value}))} placeholder="수량" style={inp}/></div>
                  <div><div style={lbl}>금액</div><input value={newExpense.amount} onChange={e=>setNewExpense(prev=>({...prev,amount:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={newExpense.date} onChange={e=>setNewExpense(prev=>({...prev,date:e.target.value}))} style={inp}/></div>
                  <div>
                    <div style={lbl}>거래처 선택 (사업자번호 자동입력) <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowVendorManager(true)}>거래처 관리</span></div>
                    <select onChange={e=>{
                      const picked = vendors.find(v=>v.id===e.target.value);
                      if (picked) setNewExpense(prev=>({...prev, bizNumber:picked.bizNumber}));
                    }} style={sel} defaultValue="">
                      <option value="">거래처 선택...</option>
                      {vendors.map(v=><option key={v.id} value={v.id}>{v.name} ({v.bizNumber})</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={lbl}>카드 선택 (카드번호 자동입력) <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowCardManager(true)}>카드 관리</span></div>
                    <select onChange={e=>{
                      const picked = cards.find(c=>c.id===e.target.value);
                      if (picked) setNewExpense(prev=>({...prev, cardNumber:picked.number}));
                    }} style={sel} defaultValue="">
                      <option value="">카드 선택...</option>
                      {cards.map(c=><option key={c.id} value={c.id}>{c.name} ({c.number})</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={newExpense.memo} onChange={e=>setNewExpense(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}><button onClick={addExpense} style={btn1}>저장</button><button onClick={()=>setShowAddExpense(false)} style={btn2}>취소</button></div>
              </div>
            )}
            {editingExpense && (
              <EditModal title="경비 수정"
                onSave={()=>{setExpenses(prev=>prev.map(e=>e.id===editingExpense.id?{...editingExpense,amount:Number(editingExpense.amount)}:e));setEditingExpense(null);}}
                onDelete={()=>{if(window.confirm("삭제?")){moveToTrash(editingExpense,"expense");setEditingExpense(null);}}}
                onClose={()=>setEditingExpense(null)}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>종류</div><select value={editingExpense.type} onChange={e=>setEditingExpense(p=>({...p,type:e.target.value}))} style={sel}>{EXPENSE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><div style={lbl}>품명</div><input value={editingExpense.itemName||""} onChange={e=>setEditingExpense(p=>({...p,itemName:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>구매처</div><input value={editingExpense.purchasePlace||""} onChange={e=>setEditingExpense(p=>({...p,purchasePlace:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>수량</div><input value={editingExpense.qty||""} onChange={e=>setEditingExpense(p=>({...p,qty:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>금액</div><input value={editingExpense.amount||""} onChange={e=>setEditingExpense(p=>({...p,amount:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={editingExpense.date||""} onChange={e=>setEditingExpense(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}>
                    <div style={lbl}>거래처 선택 (사업자번호 자동입력) <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowVendorManager(true)}>거래처 관리</span></div>
                    <select value={vendors.find(v=>v.bizNumber===editingExpense.bizNumber)?.id || ""} onChange={e=>{
                      const picked = vendors.find(v=>v.id===e.target.value);
                      setEditingExpense(p=>({...p, bizNumber: picked ? picked.bizNumber : ""}));
                    }} style={sel}>
                      <option value="">거래처 선택...</option>
                      {vendors.map(v=><option key={v.id} value={v.id}>{v.name} ({v.bizNumber})</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1 / -1"}}>
                    <div style={lbl}>카드 선택 (카드번호 자동입력) <span style={{cursor:"pointer",color:"#6d28d9",textDecoration:"underline",fontWeight:400}} onClick={()=>setShowCardManager(true)}>카드 관리</span></div>
                    <select value={cards.find(c=>c.number===editingExpense.cardNumber)?.id || ""} onChange={e=>{
                      const picked = cards.find(c=>c.id===e.target.value);
                      setEditingExpense(p=>({...p, cardNumber: picked ? picked.number : ""}));
                    }} style={sel}>
                      <option value="">카드 선택...</option>
                      {cards.map(c=><option key={c.id} value={c.id}>{c.name} ({c.number})</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={editingExpense.memo||""} onChange={e=>setEditingExpense(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}
            {expenses.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>경비 없음</div>
              : (() => {
                const filteredExpenses = selectedExpenseType ? expenses.filter(e=>e.type===selectedExpenseType) : expenses;
                if (filteredExpenses.length===0) return <div style={{...cs,textAlign:"center",color:"#6b7280"}}>해당 항목의 경비 내역이 없어요</div>;

                if (!selectedExpenseMonth) {
                  const monthGroups = filteredExpenses.reduce((acc,e)=>{
                    const month = e.date.slice(0,7);
                    if (!acc[month]) acc[month] = { items:[], total:0 };
                    acc[month].items.push(e);
                    acc[month].total += Number(e.amount||0)*Number(e.qty||1);
                    return acc;
                  }, {});
                  return Object.entries(monthGroups).sort((a,b)=>b[0].localeCompare(a[0])).map(([month,mg])=>(
                    <div key={month} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedExpenseMonth(month)}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div><div style={{fontWeight:700,fontSize:15}}>{month}</div><div style={{fontSize:12,color:"#9ca3af"}}>{mg.items.length}건</div></div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontWeight:700,fontSize:15,color:"#dc2626"}}>{formatNum(mg.total)}원</div><span style={{color:"#9ca3af"}}>▶</span></div>
                      </div>
                    </div>
                  ));
                }

                const monthExpenses = filteredExpenses.filter(e=>e.date.slice(0,7)===selectedExpenseMonth);
                const grouped = [...monthExpenses].sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,e)=>{
                  if (!acc[e.date]) acc[e.date] = [];
                  acc[e.date].push(e);
                  return acc;
                }, {});
                return (<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <button onClick={()=>{setSelectedExpenseMonth(null);setExpandedExpenseDate(null);}} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                  <div style={{fontWeight:700,fontSize:15}}>{selectedExpenseMonth}</div>
                </div>
                {Object.entries(grouped).map(([date, items]) => {
                  const dayTotal = items.reduce((s,e)=>s+Number(e.amount||0)*Number(e.qty||1),0);
                  const isExpanded = expandedExpenseDate === date;
                  return (
                    <div key={date} style={{...cs,marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                        onClick={()=>setExpandedExpenseDate(isExpanded ? null : date)}>
                        <div style={{fontWeight:700,fontSize:15}}>{date}</div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{fontSize:15,fontWeight:700,color:"#dc2626"}}>{formatNum(dayTotal)}원</div>
                          <span style={{fontSize:12,color:"#9ca3af"}}>{isExpanded?"▲":"▼"}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{marginTop:10,borderTop:"1px solid #f3f4f6",paddingTop:10}}>
                          {items.map(e=>(
                            <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f9fafb",cursor:"pointer"}} onClick={()=>setEditingExpense({...e})}>
                              <div>
                                <span style={{fontSize:13,fontWeight:600}}>{e.type}</span>
                                {e.itemName && <span style={{fontSize:13,color:"#6b7280"}}> · {e.itemName}</span>}
                                {e.purchasePlace && <span style={{fontSize:13,color:"#9ca3af"}}> · {e.purchasePlace}</span>}
                                {e.qty && Number(e.qty)>1 && <span style={{fontSize:12,color:"#9ca3af"}}> × {e.qty}</span>}
                                {e.memo && <div style={{fontSize:11,color:"#9ca3af"}}>메모: {e.memo}</div>}
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontSize:13,fontWeight:600,color:"#dc2626"}}>{formatNum(Number(e.amount||0)*Number(e.qty||1))}원</span>
                                <span style={{fontSize:11,color:"#9ca3af"}}>✏️</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                </>);
              })()
            }
          </div>
        )}

        {/* 정산 */}
        {tab==="settlements" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>정산 내역</div>
              <button onClick={()=>setShowAddSettlement(true)} style={btn1}>+ 정산 추가</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:14}}>
              {SETTLEMENT_PLATFORMS.map(p=>{
                const total=settlements.filter(s=>s.platform===p).reduce((sum,s)=>sum+Number(s.amount),0);
                return <div key={p} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #e5e7eb"}}><div style={{fontSize:11,color:"#6b7280",marginBottom:4}}>{p}</div><div style={{fontSize:15,fontWeight:700,color:"#0369a1"}}>{formatNum(total)}원</div></div>;
              })}
            </div>
            {showAddSettlement && (
              <div style={{...cs,border:"1px solid #6d28d9"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>정산 등록</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>플랫폼</div><select value={newSettlement.platform} onChange={e=>setNewSettlement(prev=>({...prev,platform:e.target.value}))} style={sel}>{SETTLEMENT_PLATFORMS.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                  <div><div style={lbl}>정산 금액</div><input value={newSettlement.amount} onChange={e=>setNewSettlement(prev=>({...prev,amount:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>정산은행</div><select value={newSettlement.bank} onChange={e=>setNewSettlement(prev=>({...prev,bank:e.target.value}))} style={sel}>{BANK_TYPES.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                  {newSettlement.bank==="기타" && <div><div style={lbl}>은행명 직접입력</div><input value={newSettlement.bankOther} onChange={e=>setNewSettlement(prev=>({...prev,bankOther:e.target.value}))} placeholder="은행명 입력" style={inp}/></div>}
                  <div><div style={lbl}>수수료 (원)</div><input value={newSettlement.fee} onChange={e=>setNewSettlement(prev=>({...prev,fee:e.target.value}))} placeholder="발생 시 입력" style={inp}/></div>
                  <div><div style={lbl}>정산일</div><input type="date" value={newSettlement.date} onChange={e=>setNewSettlement(prev=>({...prev,date:e.target.value}))} style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={newSettlement.memo} onChange={e=>setNewSettlement(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12}}><button onClick={addSettlement} style={btn1}>저장</button><button onClick={()=>setShowAddSettlement(false)} style={btn2}>취소</button></div>
              </div>
            )}
            {editingSettlement && (
              <EditModal title="정산 수정"
                onSave={()=>{setSettlements(prev=>prev.map(s=>s.id===editingSettlement.id?{...editingSettlement,amount:Number(editingSettlement.amount)}:s));setEditingSettlement(null);}}
                onDelete={()=>{if(window.confirm("삭제?")){moveToTrash(editingSettlement,"settlement");setEditingSettlement(null);}}}
                onClose={()=>setEditingSettlement(null)}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>플랫폼</div><select value={editingSettlement.platform} onChange={e=>setEditingSettlement(p=>({...p,platform:e.target.value}))} style={sel}>{SETTLEMENT_PLATFORMS.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
                  <div><div style={lbl}>금액</div><input value={editingSettlement.amount||""} onChange={e=>setEditingSettlement(p=>({...p,amount:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>정산은행</div><select value={editingSettlement.bank||"국민"} onChange={e=>setEditingSettlement(p=>({...p,bank:e.target.value}))} style={sel}>{BANK_TYPES.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                  {editingSettlement.bank==="기타" && <div><div style={lbl}>은행명 직접입력</div><input value={editingSettlement.bankOther||""} onChange={e=>setEditingSettlement(p=>({...p,bankOther:e.target.value}))} placeholder="은행명 입력" style={inp}/></div>}
                  <div><div style={lbl}>수수료 (원)</div><input value={editingSettlement.fee||""} onChange={e=>setEditingSettlement(p=>({...p,fee:e.target.value}))} placeholder="발생 시 입력" style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={editingSettlement.date||""} onChange={e=>setEditingSettlement(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={editingSettlement.memo||""} onChange={e=>setEditingSettlement(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}
            {settlements.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>정산 내역 없음</div>
              : [...settlements].reverse().map(s=>(
                <div key={s.id} style={{...cs,marginBottom:10,cursor:"pointer"}} onClick={()=>setEditingSettlement({...s})}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{s.platform}</div>
                      <div style={{fontSize:11,color:"#6b7280"}}>
                        {s.date}
                        {s.bank && ` · ${s.bank==="기타"?(s.bankOther||"기타"):s.bank}`}
                        {Number(s.fee)>0 && ` · 수수료 ${formatNum(s.fee)}원`}
                        {s.memo && ` · ${s.memo}`}
                      </div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0369a1"}}>{formatNum(s.amount)}원</div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* 매입자금현황 */}
        {tab==="funding" && (
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>매입자금 현황</div>
            {purchases.length===0 ? <div style={{...cs,textAlign:"center",color:"#9ca3af"}}>매입 내역이 없어요</div> : (() => {
              // 결제수단별 그룹핑
              const payGroups = [...purchases].reduce((acc,p)=>{
                let payKey = p.payType;
                if (p.payType==="카드" && p.cardType) payKey = `카드_${p.cardType}`;
                else if (p.payType==="페이" && p.payBrand) payKey = `페이_${p.payBrand}`;
                else if (p.payType==="계좌이체" && p.bankType) payKey = `계좌이체_${p.bankType}`;
                else if (p.payType==="기타" && p.payOther) payKey = `기타_${p.payOther}`;
                if (!acc[payKey]) acc[payKey] = { items:[], total:0 };
                acc[payKey].items.push(p);
                acc[payKey].total += Number(p.price||0)*Number(p.qty||1);
                return acc;
              }, {});

              // 선택된 소분류가 없으면 목록 표시
              if (!selectedFundingKey) {
                return (
                  <div>
                    {Object.entries(payGroups).sort((a,b)=>b[1].total-a[1].total).map(([payKey, group]) => {
                      const [payType, payDetail] = payKey.includes("_") ? payKey.split("_") : [payKey, ""];
                      return (
                        <div key={payKey} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>{setSelectedFundingKey(payKey);setSelectedFundingMonth(null);setExpandedFundingDate(null);}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <div style={{fontWeight:700,fontSize:15}}>{payType} {payDetail && <span style={{color:"#6d28d9"}}>({payDetail})</span>}</div>
                              <div style={{fontSize:12,color:"#9ca3af"}}>{group.items.length}건</div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{fontWeight:700,fontSize:15,color:"#d97706"}}>{formatNum(group.total)}원</div>
                              <span style={{color:"#9ca3af"}}>▶</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // 소분류 선택됨
              const group = payGroups[selectedFundingKey];
              const [payType, payDetail] = selectedFundingKey.includes("_") ? selectedFundingKey.split("_") : [selectedFundingKey, ""];

              // 1단계: 월 선택 안 됨 -> 월별 합계 먼저 표시
              if (!selectedFundingMonth) {
                const monthGroups = group.items.reduce((acc,p)=>{
                  const month = p.date.slice(0,7); // YYYY-MM
                  if (!acc[month]) acc[month] = { items:[], total:0 };
                  acc[month].items.push(p);
                  acc[month].total += Number(p.price||0)*Number(p.qty||1);
                  return acc;
                }, {});
                return (
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                      <button onClick={()=>setSelectedFundingKey(null)} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                      <div style={{fontWeight:700,fontSize:15}}>{payType} {payDetail && `(${payDetail})`}</div>
                      <div style={{fontSize:13,color:"#d97706",marginLeft:"auto"}}>총 {formatNum(group.total)}원</div>
                    </div>
                    {Object.entries(monthGroups).sort((a,b)=>b[0].localeCompare(a[0])).map(([month, mg]) => (
                      <div key={month} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>{setSelectedFundingMonth(month);setExpandedFundingDate(null);}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:14}}>{month}</div>
                            <div style={{fontSize:12,color:"#9ca3af"}}>{mg.items.length}건</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#d97706"}}>{formatNum(mg.total)}원</div>
                            <span style={{color:"#9ca3af"}}>▶</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              // 2단계: 월 선택됨 -> 그 달의 일자별 합계 표시
              const monthItems = group.items.filter(p=>p.date.slice(0,7)===selectedFundingMonth);
              const monthTotal = monthItems.reduce((s,p)=>s+Number(p.price||0)*Number(p.qty||1),0);
              const dateGroups = monthItems.sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,p)=>{
                if (!acc[p.date]) acc[p.date] = { items:[], total:0 };
                acc[p.date].items.push(p);
                acc[p.date].total += Number(p.price||0)*Number(p.qty||1);
                return acc;
              }, {});

              return (
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                    <button onClick={()=>{setSelectedFundingMonth(null);setExpandedFundingDate(null);}} style={{...btn2,fontSize:12,padding:"6px 12px"}}>← 뒤로</button>
                    <div style={{fontWeight:700,fontSize:15}}>{payType} {payDetail && `(${payDetail})`} · {selectedFundingMonth}</div>
                    <div style={{fontSize:13,color:"#d97706",marginLeft:"auto"}}>총 {formatNum(monthTotal)}원</div>
                  </div>
                  {Object.entries(dateGroups).map(([date, dg]) => {
                    const isExpanded = expandedFundingDate === date;
                    return (
                      <div key={date} style={{...cs,marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                          onClick={()=>setExpandedFundingDate(isExpanded ? null : date)}>
                          <div style={{fontWeight:700,fontSize:14}}>{date}</div>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#d97706"}}>{formatNum(dg.total)}원</div>
                            <span style={{fontSize:12,color:"#9ca3af"}}>{isExpanded?"▲":"▼"}</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{marginTop:10,borderTop:"1px solid #f3f4f6",paddingTop:10}}>
                            {dg.items.map(p=>(
                              <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f9fafb",fontSize:13}}>
                                <div>
                                  <div style={{fontWeight:600}}>{p.productName}</div>
                                  <div style={{fontSize:12,color:"#9ca3af"}}>{p.size&&`${p.size} · `}{p.qty}개 · {p.place||"-"}</div>
                                </div>
                                <div style={{fontWeight:700,color:"#d97706"}}>{formatNum(Number(p.price)*Number(p.qty||1))}원</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* 영수증 정리 */}
        {tab==="receipts" && (
          <div>
            <div style={{...cs, marginBottom:16}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end",marginBottom:12}}>
                <div style={{flex:"1 1 220px"}}>
                  <div style={lbl}>제목</div>
                  <input value={receiptTitle} onChange={e=>setReceiptTitle(e.target.value)} placeholder="예: 2026년 6월 경비 영수증" style={inp}/>
                </div>
                <div style={{flex:"0 0 140px"}}>
                  <div style={lbl}>용지</div>
                  <select value={receiptPaper} onChange={e=>setReceiptPaper(e.target.value)} style={sel}>
                    <option value="A4">A4 (세로)</option>
                    <option value="A4L">A4 (가로)</option>
                    <option value="A3">A3 (세로)</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>
                <div style={{flex:"0 0 140px"}}>
                  <div style={lbl}>페이지당</div>
                  <select value={receiptPerPage} onChange={e=>setReceiptPerPage(e.target.value)} style={sel}>
                    <option value="2">2개 (1×2)</option>
                    <option value="4">4개 (2×2)</option>
                    <option value="6">6개 (2×3)</option>
                    <option value="9">9개 (3×3)</option>
                    <option value="12">12개 (3×4)</option>
                  </select>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div style={{fontSize:13,color:"#6b7280"}}>
                  영수증 <b>{receipts.length}</b>장 · <b>{Math.max(1,Math.ceil(receipts.length/Number(receiptPerPage)))}</b>페이지 · 합계 <b style={{color:"#6d28d9"}}>{formatNum(receiptTotal)}원</b>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>receiptFileRef.current.click()} style={btn2}>+ 영수증 추가</button>
                  <input ref={receiptFileRef} type="file" accept="image/*" multiple onChange={e=>{addReceiptFiles(e.target.files); e.target.value="";}} style={{display:"none"}}/>
                  <button onClick={exportReceiptImages} style={btn1}>🧾 JPG로 저장</button>
                </div>
              </div>
            </div>

            {receipts.length===0 ? (
              <div style={{...cs,textAlign:"center",color:"#9ca3af",padding:40}}>영수증 사진을 추가해주세요</div>
            ) : (() => {
              const perPage = Number(receiptPerPage);
              const cols = RECEIPT_COLS[perPage];
              const pageCount = Math.max(1, Math.ceil(receipts.length/perPage));
              const pageNums = Array.from({length:pageCount}, (_,p)=>p);
              return pageNums.map(p => (
                <div key={p} style={{...cs,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",borderBottom:"2px solid #111",paddingBottom:8,marginBottom:12}}>
                    <div style={{fontWeight:800,fontSize:15}}>{receiptTitle.trim()||"영수증 정리"}</div>
                    <div style={{fontSize:11,color:"#9ca3af"}}>{RECEIPT_PAPER[receiptPaper].label} · {p+1}/{pageCount}페이지</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:10}}>
                    {Array.from({length:perPage}).map((_,i) => {
                      const idx = p*perPage+i;
                      const rec = receipts[idx];
                      if (!rec) return <div key={i} style={{border:"1px dashed #e5e7eb",borderRadius:8,minHeight:120}}/>;
                      return (
                        <div key={rec.id} style={{border:"1px solid #e5e7eb",borderRadius:8,overflow:"hidden",background:"#fff"}}>
                          <div style={{height:150,background:"#f9fafb",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                            {rec.uploading || !rec.src
                              ? <span style={{fontSize:12,color:"#6d28d9"}}>업로드 중...</span>
                              : <img src={rec.src} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",transform:`rotate(${rec.rot}deg)`}}/>}
                          </div>
                          <div style={{display:"flex",gap:4,padding:"4px 6px",borderTop:"1px dashed #e5e7eb"}}>
                            <button onClick={()=>updateReceipt(rec.id,{rot:rec.rot-90})} style={{...btn2,padding:"3px 8px",fontSize:11}}>↺</button>
                            <button onClick={()=>updateReceipt(rec.id,{rot:rec.rot+90})} style={{...btn2,padding:"3px 8px",fontSize:11}}>↻</button>
                            <button onClick={()=>reorderReceipt(idx,idx-1)} style={{...btn2,padding:"3px 8px",fontSize:11}}>◀</button>
                            <button onClick={()=>reorderReceipt(idx,idx+1)} style={{...btn2,padding:"3px 8px",fontSize:11}}>▶</button>
                            <button onClick={()=>deleteReceipt(rec.id)} style={{...btnDanger,padding:"3px 8px",fontSize:11,marginLeft:"auto"}}>✕</button>
                          </div>
                          <div style={{display:"flex",gap:4,padding:"4px 6px 6px"}}>
                            <input value={rec.desc} onChange={e=>updateReceipt(rec.id,{desc:e.target.value})} placeholder="거래처/항목" style={{...inp,fontSize:11,padding:"5px 8px",flex:1}}/>
                            <input value={rec.amt} onChange={e=>updateReceipt(rec.id,{amt:e.target.value})}
                              onBlur={e=>{const n=e.target.value.replace(/[^\d]/g,""); updateReceipt(rec.id,{amt:n?Number(n).toLocaleString("ko-KR"):""});}}
                              placeholder="금액" inputMode="numeric" style={{...inp,fontSize:11,padding:"5px 8px",width:80,textAlign:"right",color:"#6d28d9",fontWeight:700}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,borderTop:"2px solid #111",marginTop:12,paddingTop:8}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#9ca3af"}}>총 합계</span>
                    <span style={{fontSize:16,fontWeight:800,color:"#6d28d9"}}>{formatNum(receiptTotal)}원</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* 휴지통 */}
        {tab==="trash" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>휴지통</div>
              {trash.length>0 && <button onClick={()=>{if(window.confirm("전체 영구 삭제?"))setTrash([]);}} style={{...btnDanger,fontSize:12}}>전체 비우기</button>}
            </div>
            {trash.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>휴지통 비어있음 ✅</div>
              : [...trash].reverse().map(item=>(
                <div key={item.id+"_trash"} style={{...cs,marginBottom:10,border:"1px solid #3a2a2a"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{item.productName||item.name||item.type||item.platform}</div>
                      <div style={{fontSize:11,color:"#6b7280"}}>종류: {item._type} · 삭제일: {item._deletedAt?.slice(0,10)}</div>
                      {item.price && <div style={{fontSize:11,color:"#9ca3af"}}>{formatNum(item.price*item.qty)}원</div>}
                      {item.amount && <div style={{fontSize:11,color:"#9ca3af"}}>{formatNum(item.amount)}원</div>}
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      <button onClick={()=>restoreFromTrash(item)} style={{...btn2,fontSize:12,color:"#059669"}}>복구</button>
                      <button onClick={()=>{if(window.confirm("영구 삭제?"))setTrash(prev=>prev.filter(x=>x.id!==item.id));}} style={{...btnDanger,fontSize:12}}>삭제</button>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* 19번: 카드 목록 관리 */}
        {showCardManager && (
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"1px solid #6d28d9"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:16,fontWeight:700}}>카드 목록 관리</div>
                <button onClick={()=>{setShowCardManager(false);setEditingCard(null);}} style={{...btn2,fontSize:12}}>닫기</button>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                <input value={newCard.name} onChange={e=>setNewCard(p=>({...p,name:e.target.value}))} placeholder="카드 이름 (예: SSG삼성카드)" style={{...inp,flex:"1 1 140px"}}/>
                <input value={newCard.number} onChange={e=>setNewCard(p=>({...p,number:e.target.value}))} placeholder="카드번호" style={{...inp,flex:"1 1 140px"}}/>
                <button onClick={addCard} style={btn1}>추가</button>
              </div>
              {cards.length===0 ? <div style={{textAlign:"center",color:"#9ca3af",padding:20}}>등록된 카드가 없어요</div> : (
                cards.map(c => (
                  <div key={c.id} style={{marginBottom:8}}>
                    {editingCard?.id===c.id ? (
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <input value={editingCard.name} onChange={e=>setEditingCard(p=>({...p,name:e.target.value}))} style={{...inp,flex:"1 1 100px",fontSize:13}}/>
                        <input value={editingCard.number} onChange={e=>setEditingCard(p=>({...p,number:e.target.value}))} style={{...inp,flex:"1 1 100px",fontSize:13}}/>
                        <button onClick={saveEditedCard} style={{...btn1,fontSize:12}}>저장</button>
                        <button onClick={()=>setEditingCard(null)} style={{...btn2,fontSize:12}}>취소</button>
                      </div>
                    ) : (
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#f9fafb",borderRadius:8}}>
                        <div><b>{c.name}</b> <span style={{color:"#9ca3af",fontSize:12}}>{c.number}</span></div>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>setEditingCard({...c})} style={{...btn2,fontSize:11,padding:"4px 8px"}}>수정</button>
                          <button onClick={()=>deleteCard(c.id)} style={{...btnDanger,fontSize:11,padding:"4px 8px"}}>삭제</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 20번: 거래처 목록 관리 */}
        {showVendorManager && (
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"1px solid #6d28d9"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:16,fontWeight:700}}>거래처 목록 관리</div>
                <button onClick={()=>{setShowVendorManager(false);setEditingVendor(null);}} style={{...btn2,fontSize:12}}>닫기</button>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                <input value={newVendor.name} onChange={e=>setNewVendor(p=>({...p,name:e.target.value}))} placeholder="거래처명" style={{...inp,flex:"1 1 140px"}}/>
                <input value={newVendor.bizNumber} onChange={e=>setNewVendor(p=>({...p,bizNumber:e.target.value}))} placeholder="사업자번호" style={{...inp,flex:"1 1 140px"}}/>
                <button onClick={addVendor} style={btn1}>추가</button>
              </div>
              {vendors.length===0 ? <div style={{textAlign:"center",color:"#9ca3af",padding:20}}>등록된 거래처가 없어요</div> : (
                vendors.map(v => (
                  <div key={v.id} style={{marginBottom:8}}>
                    {editingVendor?.id===v.id ? (
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <input value={editingVendor.name} onChange={e=>setEditingVendor(p=>({...p,name:e.target.value}))} style={{...inp,flex:"1 1 100px",fontSize:13}}/>
                        <input value={editingVendor.bizNumber} onChange={e=>setEditingVendor(p=>({...p,bizNumber:e.target.value}))} style={{...inp,flex:"1 1 100px",fontSize:13}}/>
                        <button onClick={saveEditedVendor} style={{...btn1,fontSize:12}}>저장</button>
                        <button onClick={()=>setEditingVendor(null)} style={{...btn2,fontSize:12}}>취소</button>
                      </div>
                    ) : (
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#f9fafb",borderRadius:8}}>
                        <div><b>{v.name}</b> <span style={{color:"#9ca3af",fontSize:12}}>{v.bizNumber}</span></div>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>setEditingVendor({...v})} style={{...btn2,fontSize:11,padding:"4px 8px"}}>수정</button>
                          <button onClick={()=>deleteVendor(v.id)} style={{...btnDanger,fontSize:11,padding:"4px 8px"}}>삭제</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
