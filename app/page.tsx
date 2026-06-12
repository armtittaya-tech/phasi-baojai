"use client";

import { useState, useCallback } from "react";

// ─── Tax Logic ────────────────────────────────────────────────────────────────

function calcExpenseDeduction(incomeType: string, income: number): number {
  if (incomeType === "40(2)") return Math.min(income * 0.5, 100000);
  return income * 0.6;
}

const TAX_BRACKETS = [
  { min: 0, max: 150000, rate: 0.0 },
  { min: 150000, max: 300000, rate: 0.05 },
  { min: 300000, max: 500000, rate: 0.1 },
  { min: 500000, max: 750000, rate: 0.15 },
  { min: 750000, max: 1000000, rate: 0.2 },
  { min: 1000000, max: Infinity, rate: 0.25 },
];

function calcProgressiveTax(taxableIncome: number): number {
  let tax = 0;
  for (const b of TAX_BRACKETS) {
    if (taxableIncome <= b.min) break;
    tax += (Math.min(taxableIncome, b.max) - b.min) * b.rate;
  }
  return tax;
}

function calcTax(params: {
  incomeType: string;
  income: number;
  personalDeduction: boolean;
  socialSecurity: number;
  lifeInsurance: number;
}) {
  const expenseDeduction = calcExpenseDeduction(params.incomeType, params.income);
  const incomeAfterExpense = params.income - expenseDeduction;
  const totalDeduction =
    (params.personalDeduction ? 60000 : 0) +
    Math.min(params.socialSecurity, 9000) +
    Math.min(params.lifeInsurance, 100000);
  const netIncome = Math.max(0, incomeAfterExpense - totalDeduction);
  const tax = calcProgressiveTax(netIncome);
  return { expenseDeduction, incomeAfterExpense, totalDeduction, netIncome, tax, monthlySet: tax / 12 };
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("th-TH");
}

function parseNum(s: string) {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// ─── Components ───────────────────────────────────────────────────────────────

function NumberInput({
  label, value, onChange, max, note, placeholder = "0",
}: {
  label: string; value: string; onChange: (v: string) => void;
  max?: number; note?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {note && <p className="text-xs text-gray-400 mb-1.5">{note}</p>}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all bg-white"
          value={value === "" ? "" : Number(value).toLocaleString("th-TH")}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            onChange(raw);
          }}
          placeholder={placeholder}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">บาท</span>
      </div>
      {max && <p className="text-xs text-gray-400 mt-1">สูงสุด {fmt(max)} บาท</p>}
    </div>
  );
}

type Result = ReturnType<typeof calcTax> & { incomeRaw: number };

function ResultCard({ result, incomeType }: { result: Result; incomeType: string }) {
  const { expenseDeduction, incomeAfterExpense, totalDeduction, netIncome, tax, monthlySet, incomeRaw } = result;
  const rows = [
    { label: "รายได้รวมทั้งปี", value: incomeRaw, color: "text-gray-800" },
    {
      label: `หักค่าใช้จ่าย (${incomeType === "40(2)" ? "50% สูงสุด 100,000" : "60%"})`,
      value: -expenseDeduction, color: "text-red-500",
    },
    { label: "รายได้หลังหักค่าใช้จ่าย", value: incomeAfterExpense, color: "text-gray-800", bold: true },
    { label: "หักค่าลดหย่อนรวม", value: -totalDeduction, color: "text-red-500" },
    { label: "เงินได้สุทธิ", value: netIncome, color: "text-gray-800", bold: true },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-700 mb-4">สรุปการคำนวณ</h3>
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i} className={`flex justify-between items-center ${i === 2 || i === 4 ? "pt-2 border-t border-gray-100" : ""}`}>
              <span className={`text-sm ${r.bold ? "font-semibold text-gray-800" : "text-gray-500"}`}>{r.label}</span>
              <span className={`text-sm font-semibold tabular-nums ${r.color}`}>
                {r.value < 0 ? `−${fmt(Math.abs(r.value))}` : fmt(r.value)} บาท
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex justify-between items-center">
        <div>
          <p className="text-sm text-green-700 font-medium">ภาษีที่ต้องจ่ายทั้งปี</p>
          <p className="text-xs text-green-600 mt-0.5">คำนวณจากอัตราขั้นบันได</p>
        </div>
        <p className="text-2xl font-bold text-green-700 tabular-nums">
          {fmt(tax)} <span className="text-base font-normal">บาท</span>
        </p>
      </div>

      <div className="rounded-2xl bg-green-600 text-white p-6 text-center shadow-md">
        <p className="text-green-100 text-sm mb-1">ควรเก็บเงินไว้ต่อเดือน</p>
        <p className="text-5xl font-bold tabular-nums mt-1">{fmt(monthlySet)}</p>
        <p className="text-green-200 text-base mt-1">บาท / เดือน</p>
        <p className="text-green-200 text-xs mt-3">เพื่อให้มีเงินครบจ่ายภาษีตอนยื่น</p>
      </div>

      {tax === 0 && (
        <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-center">
          <p className="text-yellow-700 text-sm">🎉 ยินดีด้วย! รายได้ของคุณยังไม่ถึงเกณฑ์ต้องเสียภาษี</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [incomeType, setIncomeType] = useState("40(2)");
  const [income, setIncome] = useState("");
  const [personalDeduction, setPersonalDeduction] = useState(true);
  const [socialSecurity, setSocialSecurity] = useState("");
  const [lifeInsurance, setLifeInsurance] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [showBrackets, setShowBrackets] = useState(false);

  const handleCalc = useCallback(() => {
    const incomeVal = parseNum(income);
    if (!incomeVal) return;
    const r = calcTax({
      incomeType, income: incomeVal, personalDeduction,
      socialSecurity: parseNum(socialSecurity),
      lifeInsurance: parseNum(lifeInsurance),
    });
    setResult({ ...r, incomeRaw: incomeVal });
  }, [incomeType, income, personalDeduction, socialSecurity, lifeInsurance]);

  const reset = () => {
    setIncome(""); setSocialSecurity(""); setLifeInsurance("");
    setPersonalDeduction(true); setResult(null);
  };

  const brackets = [
    { range: "0 – 150,000", rate: "0%", bg: "bg-gray-100 text-gray-600" },
    { range: "150,001 – 300,000", rate: "5%", bg: "bg-green-50 text-green-700" },
    { range: "300,001 – 500,000", rate: "10%", bg: "bg-green-100 text-green-700" },
    { range: "500,001 – 750,000", rate: "15%", bg: "bg-green-200 text-green-800" },
    { range: "750,001 – 1,000,000", rate: "20%", bg: "bg-green-300 text-green-900" },
    { range: "1,000,001 ขึ้นไป", rate: "25%", bg: "bg-green-400 text-white" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-base">
            ภ
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">ภาษีเบาใจ</h1>
            <p className="text-xs text-gray-400 mt-0.5">คำนวณภาษีสำหรับ Freelancer ไทย</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Income type */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">ประเภทรายได้</h2>
          <div className="grid grid-cols-2 gap-3">
            {["40(2)", "40(6)"].map((type) => (
              <button
                key={type}
                onClick={() => { setIncomeType(type); setResult(null); }}
                className={`rounded-xl border-2 p-3.5 text-left transition-all duration-200 ${
                  incomeType === type ? "border-green-500 bg-green-50" : "border-gray-200 bg-white hover:border-green-200"
                }`}
              >
                <p className={`font-bold text-base ${incomeType === type ? "text-green-700" : "text-gray-700"}`}>{type}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {type === "40(2)" ? "รับจ้างทำงาน หักค่าใช้จ่าย 50% สูงสุด 100,000" : "วิชาชีพอิสระ หักค่าใช้จ่าย 60% ไม่จำกัด"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">รายได้และค่าลดหย่อน</h2>
          <div className="space-y-4">
            <NumberInput
              label="รายได้รวมทั้งปี"
              value={income}
              onChange={(v) => { setIncome(v); setResult(null); }}
              placeholder="เช่น 600000"
            />

            <div
              onClick={() => { setPersonalDeduction(!personalDeduction); setResult(null); }}
              className={`flex items-center gap-3 rounded-xl border-2 p-3.5 cursor-pointer transition-all duration-200 ${
                personalDeduction ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                personalDeduction ? "border-green-500 bg-green-500" : "border-gray-300"
              }`}>
                {personalDeduction && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${personalDeduction ? "text-green-700" : "text-gray-700"}`}>
                  ลดหย่อนส่วนตัว 60,000 บาท
                </p>
                <p className="text-xs text-gray-400">ทุกคนได้สิทธิ์นี้โดยอัตโนมัติ</p>
              </div>
            </div>

            <NumberInput
              label="ประกันสังคม"
              value={socialSecurity}
              onChange={(v) => { setSocialSecurity(v); setResult(null); }}
              max={9000}
              note="ถ้าจ่ายประกันสังคมในปีนี้"
            />

            <NumberInput
              label="ประกันชีวิต"
              value={lifeInsurance}
              onChange={(v) => { setLifeInsurance(v); setResult(null); }}
              max={100000}
              note="เบี้ยประกันชีวิตที่จ่ายในปีนี้"
            />
          </div>
        </div>

        <button
          onClick={handleCalc}
          disabled={!income}
          className={`w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 ${
            income
              ? "bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg active:scale-[0.98]"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          คำนวณภาษี
        </button>

        {result && <ResultCard result={result} incomeType={incomeType} />}

        {result && (
          <button
            onClick={reset}
            className="w-full py-3 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            คำนวณใหม่
          </button>
        )}

        <div>
          <button
            onClick={() => setShowBrackets(!showBrackets)}
            className="flex items-center gap-1.5 text-sm text-green-600 font-medium hover:text-green-700 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${showBrackets ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showBrackets ? "ซ่อน" : "ดู"}อัตราภาษีขั้นบันได
          </button>
          {showBrackets && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">อัตราภาษีขั้นบันได</h3>
              <div className="space-y-1.5">
                {brackets.map((b, i) => (
                  <div key={i} className={`flex justify-between rounded-lg px-3 py-2 text-xs font-medium ${b.bg}`}>
                    <span>{b.range} บาท</span>
                    <span>{b.rate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 pb-4 leading-relaxed">
          ข้อมูลนี้เป็นการประมาณการเบื้องต้นเท่านั้น<br />
          กรุณาปรึกษานักบัญชีหรือสรรพากรสำหรับการยื่นภาษีจริง
        </p>
      </main>
    </div>
  );
}
