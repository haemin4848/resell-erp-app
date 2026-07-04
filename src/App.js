import { useState, useRef, useEffect } from "react";

const PLATFORMS = ["포이즌", "크림", "기타"];
const SIZES = [200,205,210,215,220,225,230,235,240,245,250,255,260,265,270,275,280,285,290,295,300,305,310,315,320,325,330,335,340,345,350];
const PAYMENT_TYPES = ["카드", "페이", "계좌이체", "현금", "기타"];
const CARD_TYPES = ["삼성","현대","롯데","신한","KB국민","하나","우리","NH농협","기업","기타"];
const PAY_TYPES = ["카카오페이","네이버페이","토스","삼성페이","애플페이","기타"];
const BANK_TYPES = ["국민","신한","우리","하나","농협","기업","카카오뱅크","토스뱅크","SC제일","씨티","기타"];
const EXPENSE_TYPES = ["주유","식대","잡자재","기타"];
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

const emptyProduct = { code:"", brand:"", name:"", releasePrice:"", image:"", sizes:{} };
const emptyPurchase = { productId:"", manualName:"", code:"", size:"", sizes:{}, price:"", qty:"1", date:new Date().toISOString().slice(0,10), place:"", payType:"카드", cardType:"삼성", payBrand:"카카오페이", bankType:"국민", payOther:"", memo:"" };
const emptySale = { productId:"", manualName:"", code:"", size:"", sizes:{}, platform:"포이즌", platformOther:"", price:"", qty:"1", fee:"", shipping:"", date:new Date().toISOString().slice(0,10), memo:"" };
const emptyExpense = { type:"주유", amount:"", date:new Date().toISOString().slice(0,10), memo:"" };
const emptySettlement = { platform:"포이즌", amount:"", date:new Date().toISOString().slice(0,10), memo:"" };
const emptyReturn = { productId:"", productName:"", productCode:"", size:"", qty:"1", purchaseId:"", date:new Date().toISOString().slice(0,10), reason:"", memo:"" };

// 5번: EditModal을 App 밖에 정의해야 리렌더링시 커서 안 날아감
function SizePicker({ data, setter, showQty=false, toggleSize, setSizeQty }) {
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:13,color:"#6b7280",marginBottom:5,fontWeight:500}}>사이즈 선택 {showQty && "(수량도 입력 가능)"}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
        {SIZES.map(s => (
          <button key={s} onClick={() => toggleSize(s, setter)}
            style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",background:data.sizes[s]!==undefined?"#6d28d9":"#f3f4f6",color:data.sizes[s]!==undefined?"#fff":"#374151",fontSize:12,fontWeight:data.sizes[s]!==undefined?700:400}}>
            {s}
          </button>
        ))}
      </div>
      {showQty && Object.keys(data.sizes).length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {Object.keys(data.sizes).sort((a,b)=>a-b).map(size => (
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
          선택: {Object.keys(data.sizes).sort((a,b)=>a-b).map(s=>`${s}mm×${data.sizes[s]}`).join(", ")}
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

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts, prodLoaded] = useDB("products");
  const [sales, setSales, salesLoaded] = useDB("sales");
  const [purchases, setPurchases, purchLoaded] = useDB("purchases");
  const [otherIncomes, setOtherIncomes] = useDB("other_incomes");
  const [expenses, setExpenses] = useDB("expenses");
  const [settlements, setSettlements] = useDB("settlements");
  const [returns, setReturns] = useDB("returns");
  const [trash, setTrash] = useDB("trash");
  const loaded = prodLoaded && salesLoaded && purchLoaded;
  const [showAddReturn, setShowAddReturn] = useState(false);
  const [returnCodeSearch, setReturnCodeSearch] = useState("");
  const [newReturn, setNewReturn] = useState({...emptyReturn});
  const [stockCodeSearch, setStockCodeSearch] = useState("");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddSettlement, setShowAddSettlement] = useState(false);
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

  const handleImageUpload = (e, isEdit=false) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (isEdit) setEditingProduct(prev => ({ ...prev, image: ev.target.result }));
      else setNewProduct(prev => ({ ...prev, image: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleImportData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.products) setProducts(d.products);
        if (d.sales) setSales(d.sales);
        if (d.purchases) setPurchases(d.purchases);
        if (d.otherIncomes) setOtherIncomes(d.otherIncomes);
        if (d.expenses) setExpenses(d.expenses);
        if (d.settlements) setSettlements(d.settlements);
        if (d.returns) setReturns(d.returns);
        if (d.trash) setTrash(d.trash);
        alert("불러오기 완료!");
      } catch { alert("파일 오류"); }
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
    const outQty = sales.filter(s => s.productId===productId && s.size===size).reduce((s,x) => s+Number(x.qty||1), 0);
    const returnQty = returns.filter(r => r.productId===productId && r.size===size).reduce((s,r) => s+Number(r.qty||1), 0);
    return inQty - outQty - returnQty;
  };

  // 3번: 품번으로 자동 검색
  const handleCodeInput = (code, type) => {
    const found = products.find(p => p.code && p.code.toLowerCase()===code.toLowerCase());
    if (type==="sale") setNewSale(prev => ({ ...prev, code, productId: found?.id||"", manualName: found ? "" : prev.manualName, size:"" }));
    else setNewPurchase(prev => ({ ...prev, code, productId: found?.id||"", manualName: found ? "" : prev.manualName, size:"" }));
  };

  const totalSell = sales.reduce((s,x) => s+Number(x.price)*Number(x.qty||1), 0);
  const totalBuy = purchases.reduce((s,x) => s+Number(x.price)*Number(x.qty||1), 0);
  const totalProfit = sales.reduce((s,sale) => s+calcProfit(sale).profit, 0);
  const totalExpenses = expenses.reduce((s,x) => s+Number(x.amount||0), 0);
  const totalSettled = settlements.reduce((s,x) => s+Number(x.amount||0), 0);
  const totalVatRefund = purchases.reduce((s,p) => s+calcVat(p.price,p.qty).vat, 0);

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
      const dup = products.find(p => p.code && p.code.toLowerCase()===newProduct.code.toLowerCase());
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

  // 5번: 메뉴 순서
  const tabs = [
    {id:"dashboard",label:"📊 대시보드"},
    {id:"scan",label:"📦 바코드"},
    {id:"products",label:"👟 상품"},
    {id:"purchases",label:"🛒 매입"},
    {id:"sales",label:"💰 매출"},
    {id:"stock",label:"📋 재고현황"},
    {id:"returns",label:"↩️ 반품"},
    {id:"expenses",label:"💸 경비"},
    {id:"settlements",label:"🏦 정산"},
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
                {label:"총 매출",value:`${formatNum(totalSell)}원`,color:"#6d28d9"},
                {label:"총 수익",value:`${formatNum(totalProfit)}원`,color:totalProfit>=0?"#059669":"#dc2626"},
                {label:"총 매입",value:`${formatNum(totalBuy)}원`,color:"#d97706"},
                {label:"총 경비",value:`${formatNum(totalExpenses)}원`,color:"#dc2626"},
                {label:"총 정산",value:`${formatNum(totalSettled)}원`,color:"#0369a1"},
                {label:"부가세환급 예상",value:`${formatNum(Math.round(totalVatRefund))}원`,color:"#b45309"},
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
                {/* 2번: contain */}
                <div style={{marginBottom:12}}>
                  <div style={lbl}>이미지</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {newProduct.image ? <img src={newProduct.image} alt="" style={{width:64,height:64,borderRadius:8,objectFit:"contain",background:"#f3f4f6"}}/> : <div style={{width:64,height:64,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#9ca3af"}}>👟</div>}
                    <button onClick={()=>imageInputRef.current.click()} style={{...btn2,fontSize:12}}>선택</button>
                    <input ref={imageInputRef} type="file" accept="image/*" onChange={e=>handleImageUpload(e,false)} style={{display:"none"}}/>
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
                  <div style={lbl}>이미지</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {editingProduct.image ? <img src={editingProduct.image} alt="" style={{width:64,height:64,borderRadius:8,objectFit:"contain",background:"#f3f4f6"}}/> : <div style={{width:64,height:64,borderRadius:8,background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#9ca3af"}}>👟</div>}
                    <button onClick={()=>editImageRef.current.click()} style={{...btn2,fontSize:12}}>이미지 변경</button>
                    {editingProduct.image && <button onClick={()=>setEditingProduct(p=>({...p,image:""}))} style={{...btnDanger,fontSize:12}}>삭제</button>}
                    <input ref={editImageRef} type="file" accept="image/*" onChange={e=>handleImageUpload(e,true)} style={{display:"none"}}/>
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
                        <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#6d28d9"}}>✏️ 수정</div>
                      </div>
                      <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{p.brand} · 품번: {p.code||"-"} · 발행가: {formatNum(p.releasePrice)}원</div>
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>매입 내역</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{ const rows=[["날짜","품번","상품명","사이즈","매입가","공급가액","부가세","수량","합계","매입장소","결제수단","메모"]]; purchases.forEach(p=>{const{supply,vat}=calcVat(p.price,p.qty);rows.push([p.date,p.productCode||"",p.productName||"",p.size||"",p.price,Math.round(supply),Math.round(vat),p.qty,p.price*p.qty,p.place||"",p.payType||"",p.memo||""]);}); exportToCSV(rows,"매입내역.csv"); }} style={{...btn2,fontSize:12}}>📥 엑셀</button>
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
                    <select value={newPurchase.productId} onChange={e=>setNewPurchase(prev=>({...prev,productId:e.target.value,code:products.find(p=>p.id===e.target.value)?.code||"",size:"",sizes:{}}))} style={sel}>
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
                  {newPurchase.payType==="카드" && <div><div style={lbl}>카드사</div><select value={newPurchase.cardType} onChange={e=>setNewPurchase(prev=>({...prev,cardType:e.target.value}))} style={sel}>{CARD_TYPES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
                  {newPurchase.payType==="페이" && <div><div style={lbl}>페이 종류</div><select value={newPurchase.payBrand} onChange={e=>setNewPurchase(prev=>({...prev,payBrand:e.target.value}))} style={sel}>{PAY_TYPES.map(p=><option key={p} value={p}>{p}</option>)}</select></div>}
                  {newPurchase.payType==="계좌이체" && <div><div style={lbl}>은행</div><select value={newPurchase.bankType} onChange={e=>setNewPurchase(prev=>({...prev,bankType:e.target.value}))} style={sel}>{BANK_TYPES.map(b=><option key={b} value={b}>{b}</option>)}</select></div>}
                  {newPurchase.payType==="기타" && <div><div style={lbl}>결제방법 입력</div><input value={newPurchase.payOther} onChange={e=>setNewPurchase(prev=>({...prev,payOther:e.target.value}))} placeholder="직접 입력" style={inp}/></div>}
                  {[{key:"price",label:"매입가 (원)"},{key:"date",label:"매입일",type:"date"},{key:"place",label:"매입장소"}].map(f=>(
                    <div key={f.key}><div style={lbl}>{f.label}</div><input value={newPurchase[f.key]} onChange={e=>setNewPurchase(prev=>({...prev,[f.key]:e.target.value}))} type={f.type||"text"} style={inp}/></div>
                  ))}
                  <div style={{gridColumn:"1 / -1"}}><div style={lbl}>메모</div><input value={newPurchase.memo} onChange={e=>setNewPurchase(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
                </div>
                {/* 9번: 사이즈별 수량 */}
                <div style={{marginTop:12}}>
                  <SizePicker data={newPurchase} setter={setNewPurchase} showQty={true} toggleSize={toggleSize} setSizeQty={setSizeQty}/>
                </div>
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

            {/* 8번: 수정 모달 */}
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
                  <div><div style={lbl}>메모</div><input value={editingPurchase.memo||""} onChange={e=>setEditingPurchase(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}

            {purchases.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>매입 내역 없음</div>
              : (() => {
                const grouped = [...purchases].sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,p)=>{
                  if (!acc[p.date]) acc[p.date] = {};
                  const key = p.productId || p.manualName || p.productName;
                  if (!acc[p.date][key]) acc[p.date][key] = [];
                  acc[p.date][key].push(p);
                  return acc;
                }, {});
                return Object.entries(grouped).map(([date, productGroups]) => {
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
                                  <div style={{fontWeight:700,fontSize:15}}>{items[0].productName} {sizes && <span style={{color:"#6d28d9"}}>{sizes}mm</span>}</div>
                                  <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>품번: {items[0].productCode||"-"} · 총 {totalQty}개 · {items[0].place||"-"}</div>
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
                });
              })()
            }
          </div>
        )}

        {/* 매출 */}
        {tab==="sales" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>매출 내역</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{ const rows=[["날짜","품번","상품명","사이즈","플랫폼","판매가","수량","수수료","배송비","수익","수익율","메모"]]; sales.forEach(s=>{const{profit,profitRate}=calcProfit(s);rows.push([s.date,s.productCode||"",s.productName||"",s.size||"",s.platform==="기타"?s.platformOther||"기타":s.platform,s.price,s.qty,s.fee||0,s.shipping||0,profit,`${profitRate.toFixed(1)}%`,s.memo||""]);}); exportToCSV(rows,"매출내역.csv"); }} style={{...btn2,fontSize:12}}>📥 엑셀</button>
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
                      {selectedProd && Object.keys(selectedProd.sizes).sort((a,b)=>a-b).map(s=><option key={s} value={s}>{s}mm (재고 {calcStock(selectedProd.id,s)}개)</option>)}
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
              : (() => {
                const grouped = [...sales].sort((a,b)=>b.date.localeCompare(a.date)).reduce((acc,s)=>{
                  if (!acc[s.date]) acc[s.date] = {};
                  const key = s.productId || s.manualName || s.productName;
                  if (!acc[s.date][key]) acc[s.date][key] = [];
                  acc[s.date][key].push(s);
                  return acc;
                }, {});
                return Object.entries(grouped).map(([date, productGroups]) => {
                  const dayTotal = Object.values(productGroups).flat().reduce((s,x)=>s+Number(x.price)*Number(x.qty||1),0);
                  const dayProfit = Object.values(productGroups).flat().reduce((s,x)=>s+calcProfit(x).profit,0);
                  return (
                    <div key={date} style={{marginBottom:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#6b7280",marginBottom:8,padding:"6px 12px",background:"#f3f4f6",borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                        <span>{date}</span>
                        <span><span style={{color:"#6d28d9"}}>합계 {formatNum(dayTotal)}원</span> · <span style={{color:dayProfit>=0?"#059669":"#dc2626"}}>수익 {formatNum(dayProfit)}원</span></span>
                      </div>
                      {Object.entries(productGroups).map(([key, items]) => {
                        const prod = products.find(p=>p.id===items[0].productId);
                        const totalQty = items.reduce((s,x)=>s+Number(x.qty||1),0);
                        const totalAmt = items.reduce((s,x)=>s+Number(x.price)*Number(x.qty||1),0);
                        const totalProfit = items.reduce((s,x)=>s+calcProfit(x).profit,0);
                        const avgProfitRate = totalAmt>0?(totalProfit/totalAmt*100):0;
                        const sizes = items.map(x=>x.size).filter(Boolean).join(", ");
                        return (
                          <div key={key} style={{...cs,marginBottom:8,cursor:"pointer"}} onClick={()=>setEditingSale({...items[0]})}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                {prod?.image && <img src={prod.image} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"contain",background:"#f3f4f6"}}/>}
                                <div>
                                  <div style={{fontWeight:700,fontSize:15}}>{items[0].productName} {sizes && <span style={{color:"#6d28d9"}}>{sizes}mm</span>}</div>
                                  <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>품번: {items[0].productCode||"-"} · {items[0].platform==="기타"?items[0].platformOther||"기타":items[0].platform} · 총 {totalQty}개</div>
                                  <div style={{fontSize:12,color:"#6b7280"}}>수수료: {formatNum(items[0].fee||0)}원 · 배송비: {formatNum(items[0].shipping||0)}원</div>
                                </div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                <div style={{fontSize:15,fontWeight:700}}>{formatNum(totalAmt)}원</div>
                                <div style={{fontSize:12,color:totalProfit>=0?"#059669":"#dc2626"}}>수익 {formatNum(totalProfit)}원</div>
                                <div style={{fontSize:12,color:avgProfitRate>=0?"#059669":"#dc2626"}}>{avgProfitRate.toFixed(1)}%</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()
            }
          </div>
        )}

        {/* 재고현황 */}
        {tab==="stock" && (
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>재고 현황</div>
            <div style={cs}>
              <div style={lbl}>품번 검색</div>
              <input value={stockCodeSearch} onChange={e=>setStockCodeSearch(e.target.value)}
                placeholder="품번 입력 후 검색" style={{...inp,marginBottom:0}}/>
            </div>
            {(() => {
              const filtered = stockCodeSearch
                ? products.filter(p=>p.code&&p.code.toLowerCase().includes(stockCodeSearch.toLowerCase()))
                : products;
              const withStock = filtered.map(p=>({
                ...p,
                stockList: Object.keys(p.sizes).map(size=>({size,stock:calcStock(p.id,size)})).filter(x=>x.stock>0)
              })).filter(p=>p.stockList.length>0);

              if (withStock.length===0) return <div style={{...cs,textAlign:"center",color:"#9ca3af"}}>{stockCodeSearch?"검색 결과 없음":"보유 재고 없음"}</div>;

              return withStock.sort((a,b)=>a.brand.localeCompare(b.brand,"ko")||a.name.localeCompare(b.name,"ko")).map(p=>{
                const pPurchases = purchases.filter(x=>x.productId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
                const pSales = sales.filter(x=>x.productId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
                const totalStock = p.stockList.reduce((s,x)=>s+x.stock,0);
                return (
                  <div key={p.id} style={cs}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      {p.image && <img src={p.image} alt="" style={{width:56,height:56,borderRadius:8,objectFit:"contain",background:"#f3f4f6"}}/>}
                      <div>
                        <div style={{fontWeight:700,fontSize:16}}>{p.name}</div>
                        <div style={{fontSize:13,color:"#6b7280"}}>품번: {p.code||"-"} · {p.brand} · 총 {totalStock}개</div>
                      </div>
                    </div>
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
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:"#059669",marginBottom:6}}>매출 내역</div>
                        {pSales.map(x=>(
                          <div key={x.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}>
                            <span style={{color:"#6b7280"}}>{x.date} · {x.size}mm · {x.qty}개 · {x.platform}</span>
                            <span style={{fontWeight:600,color:"#059669"}}>{formatNum(x.price*x.qty)}원</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* 반품 */}
        {tab==="returns" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>반품 내역</div>
              <button onClick={()=>setShowAddReturn(true)} style={btn1}>+ 반품 추가</button>
            </div>
            {showAddReturn && (
              <div style={{...cs,border:"2px solid #6d28d9"}}>
                <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>반품 등록</div>
                <div style={{marginBottom:12}}>
                  <div style={lbl}>품번 입력 (매입 내역 자동 검색)</div>
                  <input value={returnCodeSearch} onChange={e=>setReturnCodeSearch(e.target.value)} placeholder="품번 입력" style={inp}/>
                </div>
                {returnCodeSearch && (() => {
                  const matchedProd = products.find(p=>p.code&&p.code.toLowerCase()===returnCodeSearch.toLowerCase());
                  const matchedPurchases = matchedProd ? purchases.filter(p=>p.productId===matchedProd.id).sort((a,b)=>b.date.localeCompare(a.date)) : [];
                  if (!matchedProd) return <div style={{padding:"10px",color:"#dc2626",fontSize:13}}>등록된 품번을 찾을 수 없어요</div>;
                  if (matchedPurchases.length===0) return <div style={{padding:"10px",color:"#9ca3af",fontSize:13}}>매입 내역이 없어요</div>;
                  return (
                    <div>
                      <div style={lbl}>매입 내역 선택</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                        {matchedPurchases.map(p=>(
                          <div key={p.id} onClick={()=>setNewReturn(prev=>({...prev,productId:matchedProd.id,productName:matchedProd.name,productCode:matchedProd.code,size:p.size,purchaseId:p.id}))}
                            style={{padding:"10px 14px",borderRadius:8,border:newReturn.purchaseId===p.id?"2px solid #6d28d9":"1px solid #e5e7eb",background:newReturn.purchaseId===p.id?"#ede9fe":"#f9fafb",cursor:"pointer",fontSize:13}}>
                            <span style={{fontWeight:600}}>{p.date}</span> · {p.size}mm · {p.qty}개 · {formatNum(p.price)}원 · {p.place||"-"}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {newReturn.purchaseId && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div><div style={lbl}>반품 수량</div><input type="number" min="1" value={newReturn.qty} onChange={e=>setNewReturn(p=>({...p,qty:e.target.value}))} style={inp}/></div>
                    <div><div style={lbl}>반품일</div><input type="date" value={newReturn.date} onChange={e=>setNewReturn(p=>({...p,date:e.target.value}))} style={inp}/></div>
                    <div><div style={lbl}>반품 사유</div><input value={newReturn.reason} onChange={e=>setNewReturn(p=>({...p,reason:e.target.value}))} placeholder="예: 불량, 사이즈 오류" style={inp}/></div>
                    <div><div style={lbl}>메모</div><input value={newReturn.memo} onChange={e=>setNewReturn(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                  </div>
                )}
                <div style={{display:"flex",gap:8,marginTop:14}}>
                  <button onClick={()=>{
                    if(!newReturn.purchaseId){alert("매입 내역을 선택해주세요!");return;}
                    setReturns(prev=>[...prev,{...newReturn,id:generateId(),qty:Number(newReturn.qty)||1}]);
                    setReturnCodeSearch(""); setNewReturn({...emptyReturn}); setShowAddReturn(false);
                  }} style={btn1}>저장</button>
                  <button onClick={()=>{setShowAddReturn(false);setReturnCodeSearch("");setNewReturn({...emptyReturn});}} style={btn2}>취소</button>
                </div>
              </div>
            )}
            {returns.length===0 ? <div style={{...cs,textAlign:"center",color:"#9ca3af"}}>반품 내역이 없어요</div>
              : [...returns].reverse().map(r=>(
                <div key={r.id} style={{...cs,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{r.productName} <span style={{color:"#6d28d9"}}>{r.size}mm</span></div>
                      <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>품번: {r.productCode||"-"} · {r.date} · {r.qty}개</div>
                      {r.reason && <div style={{fontSize:12,color:"#dc2626"}}>사유: {r.reason}</div>}
                      {r.memo && <div style={{fontSize:12,color:"#9ca3af"}}>메모: {r.memo}</div>}
                    </div>
                    <button onClick={()=>{if(window.confirm("삭제?"))setReturns(prev=>prev.filter(x=>x.id!==r.id));}} style={{...btnDanger,fontSize:12}}>삭제</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* 경비 */}
        {tab==="expenses" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700}}>경비 내역</div>
              <button onClick={()=>setShowAddExpense(true)} style={btn1}>+ 경비 추가</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:14}}>
              {EXPENSE_TYPES.map(type=>{
                const total=expenses.filter(e=>e.type===type).reduce((s,e)=>s+Number(e.amount),0);
                return <div key={type} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #e5e7eb"}}><div style={{fontSize:11,color:"#6b7280",marginBottom:4}}>{type}</div><div style={{fontSize:15,fontWeight:700,color:"#dc2626"}}>{formatNum(total)}원</div></div>;
              })}
            </div>
            {showAddExpense && (
              <div style={{...cs,border:"1px solid #6d28d9"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>경비 등록</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div style={lbl}>종류</div><select value={newExpense.type} onChange={e=>setNewExpense(prev=>({...prev,type:e.target.value}))} style={sel}>{EXPENSE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><div style={lbl}>금액</div><input value={newExpense.amount} onChange={e=>setNewExpense(prev=>({...prev,amount:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={newExpense.date} onChange={e=>setNewExpense(prev=>({...prev,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>메모</div><input value={newExpense.memo} onChange={e=>setNewExpense(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
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
                  <div><div style={lbl}>금액</div><input value={editingExpense.amount||""} onChange={e=>setEditingExpense(p=>({...p,amount:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>날짜</div><input type="date" value={editingExpense.date||""} onChange={e=>setEditingExpense(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>메모</div><input value={editingExpense.memo||""} onChange={e=>setEditingExpense(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}
            {expenses.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>경비 없음</div>
              : [...expenses].reverse().map(e=>(
                <div key={e.id} style={{...cs,marginBottom:10,cursor:"pointer"}} onClick={()=>setEditingExpense({...e})}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{fontWeight:700,fontSize:14}}>{e.type}</div><div style={{fontSize:11,color:"#6b7280"}}>{e.date} {e.memo&&`· ${e.memo}`}</div></div>
                    <div style={{fontSize:13,fontWeight:700,color:"#dc2626"}}>{formatNum(e.amount)}원</div>
                  </div>
                </div>
              ))
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
                  <div><div style={lbl}>정산일</div><input type="date" value={newSettlement.date} onChange={e=>setNewSettlement(prev=>({...prev,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>메모</div><input value={newSettlement.memo} onChange={e=>setNewSettlement(prev=>({...prev,memo:e.target.value}))} style={inp}/></div>
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
                  <div><div style={lbl}>날짜</div><input type="date" value={editingSettlement.date||""} onChange={e=>setEditingSettlement(p=>({...p,date:e.target.value}))} style={inp}/></div>
                  <div><div style={lbl}>메모</div><input value={editingSettlement.memo||""} onChange={e=>setEditingSettlement(p=>({...p,memo:e.target.value}))} style={inp}/></div>
                </div>
              </EditModal>
            )}
            {settlements.length===0 ? <div style={{...cs,textAlign:"center",color:"#6b7280"}}>정산 내역 없음</div>
              : [...settlements].reverse().map(s=>(
                <div key={s.id} style={{...cs,marginBottom:10,cursor:"pointer"}} onClick={()=>setEditingSettlement({...s})}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{fontWeight:700,fontSize:14}}>{s.platform}</div><div style={{fontSize:11,color:"#6b7280"}}>{s.date} {s.memo&&`· ${s.memo}`}</div></div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0369a1"}}>{formatNum(s.amount)}원</div>
                  </div>
                </div>
              ))
            }
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

      </div>
    </div>
  );
}
