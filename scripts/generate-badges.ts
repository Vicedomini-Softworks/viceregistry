import fs from "fs"
import path from "path"

async function generateBadges() {
  const badgesDir = path.join(process.cwd(), "public", "badges")
  if (!fs.existsSync(badgesDir)) {
    fs.mkdirSync(badgesDir, { recursive: true })
  }

  // 1. Coverage Badge
  let coveragePct = 0
  try {
    const covSummary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "coverage", "coverage-summary.json"), "utf-8"))
    coveragePct = covSummary.total.lines.pct
  } catch (_e) {
    // eslint-disable-next-line no-console -- warn non error
    console.warn("Could not read coverage summary, defaulting to 0%")
  }

  // 2. Mutation Badge
  let mutationPct = 0
  try {
    const mutReport = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "mutation", "mutation.json"), "utf-8"))
    let killed = 0
    let survived = 0
    let timeout = 0
    let noCoverage = 0

    const files = Object.values(mutReport.files) as Array<{ mutants: Array<{ status: string }> }>
    for (const file of files) {
      for (const mutant of file.mutants) {
        if (mutant.status === "Killed") killed++
        else if (mutant.status === "Survived") survived++
        else if (mutant.status === "Timeout") timeout++
        else if (mutant.status === "NoCoverage") noCoverage++
      }
    }

    const total = killed + timeout + survived + noCoverage
    mutationPct = total > 0 ? ((killed + timeout) / total) * 100 : 0
  } catch (_e) {
    console.warn("Could not read mutation report, defaulting to 0%")
  }

  const getColor = (pct: number) => {
    if (pct >= 95) return "brightgreen"
    if (pct >= 90) return "green"
    if (pct >= 80) return "yellow"
    if (pct >= 70) return "orange"
    return "red"
  }

  const downloadBadge = async (label: string, pct: number, filename: string) => {
    const color = getColor(pct)
    const url = `https://img.shields.io/badge/${label}-${pct.toFixed(1)}%25-${color}`
    const res = await fetch(url)
    const svg = await res.text()
    fs.writeFileSync(path.join(badgesDir, filename), svg)
    console.log(`Generated ${filename} (${pct.toFixed(1)}%)`)
  }

  await downloadBadge("Coverage", coveragePct, "coverage.svg")
  await downloadBadge("Mutation", mutationPct, "mutation.svg")
}

generateBadges().catch(console.error)
