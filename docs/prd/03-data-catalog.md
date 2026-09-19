# Data catalog: all six programs

## Deliverable and research status

Create a hand-curated, versioned catalog containing `snap`, `eitc`, `ceap`, `medicare_help`, `wic`, and `lifeline`. All six are required for v1. Medicare cost help is one card containing separately identified MSP and Extra Help pathways; never merge their eligibility rules or values.

The source discovery below was performed September 19, 2026. It supplies starting facts, destinations, caveats and exact research work. It is not a certification that every rule/document requirement has been verified. Some agency pages were inaccessible and some published tables lacked visible effective dates. P1-04 through P1-09 must complete claim-level review before the catalog release gate. No runtime scraping or model-invented thresholds. A sourced referral-only entry can be useful during development, but six referral placeholders do not satisfy the completed six-program screening requirement.

## Catalog structure

Store one JSON file per program, source records separately, and a manifest with deterministic content hashes. Keep source snapshots/excerpts outside the browser bundle; ship only the small reviewed catalog. Text entered into this PRD's examples is a draft until its evidence record passes review.

```ts
type Source = {
  id: string; url: string; publisher: string; title: string;
  retrievedOn: string; effectiveFrom: string | null; effectiveTo: string | null;
  section: string; reviewStatus: 'pending' | 'verified' | 'conflict' | 'inaccessible';
};
type Evidence = {
  id: string; text: string; sourceIds: string[];
  kind: 'eligibility' | 'value' | 'document' | 'application' | 'caveat';
};
type Rule = {
  id: string; fieldIds: string[]; evidenceIds: string[];
  operator: 'enumIn' | 'lte' | 'gte' | 'range' | 'all' | 'any' | 'referral';
  operands: unknown; // implement a discriminated runtime union; never eval strings
  effect: 'screening' | 'exclusion' | 'referral';
  exceptionRuleIds: string[]; blocksLikelyWhenUnknown: boolean;
};
type Program = {
  id: string; name: string; jurisdiction: 'TX' | 'US';
  version: string; status: 'draft' | 'reviewed' | 'published' | 'retired';
  validFrom: string; validTo: string | null; reviewDueOn: string;
  coverage: string; limitations: string[];
  eligibilitySummary: string[]; // 2–4 sentences, not a substitute for rule records
  evidence: Evidence[]; rules: Rule[];
  requiredFieldIds: string[]; optionalFieldIds: string[];
  value: { kind:'variable'|'discount'|'maximum'|'range'; text:string;
    evidenceIds:string[]; period:'month'|'taxYear'|'year'|'varies'; taxYear?:number };
  documents: {id:string; label:string; whenRuleId:string|null;
    requiredness:'required'|'mayNeed'|'askAgency'; evidenceIds:string[]}[];
  application: {id:string; label:string; url:string; evidenceIds:string[]}[];
  fallbackExplanation: string; fallbackChecklistIds: string[];
};
```

Every rule must reference published evidence and a supported evaluator. Reject dangling IDs, cyclic compound rules, empty evidence, duplicate versions, mixed tax years, non-HTTPS destinations, and unsupported currency/period combinations. `validTo:null` does not mean “valid forever”: `reviewDueOn` still gates freshness. Set review deadlines to the earlier of the known rule transition or 30 days after review. Re-check all six before each release.

## Six-program authoring packets

### 1. SNAP — food benefits

**Purpose:** help with groceries. Draft value text: “The amount depends on your household and income.” Do not present the brief's $188/month example as a personalized estimate.

**Screening fields:** Texas residence; food household size; gross income range and period; older-adult/disability exception flag; applicable deductions and categorical pathway status. Add `olderOrDisabled:Tri` and `snapExceptionStatus:'applies'|'doesNotApply'|'unknown'` to the SNAP extension. Missing exception information makes an above-general-threshold case unknown, not an automatic rejection.

**Research anchor:** Texas HHS [C-120 SNAP tables](https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/c-120-supplemental-nutrition-assistance-program). The retrieved table is effective October 1, 2025: household sizes 1/2/3/4 have gross monthly 130% figures of $1,696/$2,292/$2,888/$3,483 and net figures of $1,305/$1,763/$2,221/$2,680. Its 165% column has specific separate-household/categorical uses. These figures are a dated authoring seed, not the whole eligibility policy. Review the October 2026 transition before shipping across that date.

**Next-step seed:** [SNAP food benefits](https://www.hhs.texas.gov/services/food/snap-food-benefits) and Your Texas Benefits linked from official HHS/WIC resources. The SNAP overview returned 403 in this research session; application and document details require manual verification. Do not invent mandatory paperwork. Until verified, the safe checklist is “Open the official SNAP page” and “Ask what information applies to your household,” grounded in the verified destination record.

**P1 completion:** capture applicable income tables, household definitions, elderly/disability exceptions, deductions scope, work/student/nonfinancial referral caveats, current application destination and source-backed document categories. Mark cases outside the implemented screen as “Possibly”/agency review. Do not collect immigration details or claim those criteria were checked.

### 2. EITC — earned income tax credit

**Purpose:** a tax credit, not a monthly benefit. Draft value text: “The credit depends on your tax year, income, filing status and qualifying children.” User selects the tax year; do not default a September 2026 session silently to tax year 2026.

**Fields:** `taxYear`, `filingStatus` (single/headOfHousehold/joint/separate/survivingSpouse/unknown), earned-income and AGI intervals for that year, `qualifyingChildrenCount` (0..3 where 3 means 3+ only when explicit), `investmentIncomeWithinLimit:Tri`, `childlessAge25to64:Tri`, `specialRuleApplies:Tri`. A dependent is not automatically a qualifying child. Household size does not determine filing status.

**Sources:** [IRS EITC rules](https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/who-qualifies-for-the-earned-income-tax-credit-eitc) and [IRS tax-year tables](https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/earned-income-and-earned-income-tax-credit-eitc-tables). The retrieved 2025 table shows maximum credits of $649, $4,328, $7,152 and $8,046 for 0/1/2/3+ qualifying children; these are maximums, not a person's award. Earned income, investment income and additional filing rules matter; some separate filers have exceptions. Route sensitive identity/residency conditions to the official checker without collecting SSNs.

**Action packet:** direct to the IRS EITC Assistant from the rules page; offer the official free tax-preparation resource linked there. Display “Tax year 2025” on a 2025 result. Gather income/tax forms only as a sourced preparation suggestion after checking the IRS preparer list; never accept uploads.

**P1 completion:** implement one explicitly selected published tax year end to end, income bands for all supported filing/child categories, childless age path, exception/referral flags, and preparation items with citations. Other years remain clearly unsupported until separately reviewed. The card remains in the six-program catalog even for people without earned income, with its reason in “Other programs checked.”

### 3. CEAP / LIHEAP — Texas utility assistance

**Purpose:** help with eligible home energy costs. Draft value text: “Help varies by local provider, household and available funding.” No dollar estimate or promise that aid is currently available.

**Fields:** Texas residency, household size/income, `utilityResponsibility:Tri`, `needsHeatingCoolingHelp:Tri`, optional county selected from a reviewed enum for local routing. County can stay local when opening the state provider finder. Exact service address and account number are never collected.

**Sources:** [TDHCA CEAP](https://www.tdhca.texas.gov/comprehensive-energy-assistance-program-ceap) describes administration through local organizations across Texas. [Help for Texans](https://www.tdhca.texas.gov/help-for-texans) locates providers and notes funding/capacity limits. [Income guidelines](https://www.tdhca.texas.gov/community-affairs-income-guidelines) returned 403 during this session. Retrieve the current approved state plan and income guidelines linked from CEAP before implementing numeric checks.

**Action packet:** “Find a local utility-help provider”; “Ask whether applications are open”; “Ask which documents your provider needs.” Provider-specific bills/income/identity requirements must have provider or agency evidence before they become required checklist items. The state agency is not the direct individual application destination.

**P1 completion:** curate current threshold/period table, household definition and utility responsibility criteria; capture effective dates; verify the provider-finder path for Denton and Collin counties as demo checks. No need to replicate all provider directories: the official statewide finder is the canonical next step for every Texas county. This is a complete routing design, not permission to invent local providers.

### 4. Medicare cost help — MSP and Extra Help

**Purpose:** explain help with Medicare costs while retaining distinct pathways. Draft value text: “May lower Medicare premiums or prescription costs; the program determines the amount.” Do not reuse the brief's roughly $6,200 annual approximation as a current guaranteed value.

**Fields:** Part A / Part B-ID status, individual/couple category, income basis and interval, countable-resource band, other Medicaid status; Extra Help has its own income/resource and automatic-qualification predicates. Age alone cannot exclude younger Medicare beneficiaries.

**Sources:** [Texas MSP handbook](https://fhb.hhs.texas.gov/handbooks/medicaid-elderly-people-disabilities-handbook/appendix-ix-medicare-savings-program-information) reports March 1, 2026 amounts in a June revision, including QMB individual/couple monthly limits of $1,330/$1,804 before its stated general disregard. Resource limits and QMB/SLMB/QI/QDWI differences must be preserved. [Medicare Extra Help](https://www.medicare.gov/basics/costs/help/drug-costs) is a different program; [SSA application entry](https://www.ssa.gov/medicare/part-d-extra-help) supplies its next step. The Medicare page mixes 2026 eligibility with 2027 cost information: tag each claim by year rather than copying the page as one effective record.

**P1 completion:** separate subprogram rules, inclusive/exclusive boundaries, exclusions/disregards and resource predicates. Curate current Texas application/referral and SSA preparation items. For unsupported complicated situations offer official counseling/application guidance rather than a false rejection. Use a parent card with pathway-specific reasons/checklists; no summed dollar savings or assumption that Extra Help and MSP are interchangeable.

### 5. WIC — nutrition support

**Purpose:** food and nutrition support for eligible pregnancy/postpartum/breastfeeding situations and children under five. Draft value text: “Food and nutrition support varies by participant.”

**Fields:** Texas residence, relevant category flag, household definition/expected infants when applicable, income or SNAP/Medicaid/TANF participation. Nutritional assessment is an agency step, not a model diagnosis.

**Source and action:** [Texas WIC application page](https://www.texaswic.org/apply) supplies categories, income routes, application/appointment entry and 800-942-3678. It lists preparation categories including proof of address, program participation, income and identification. Phrase as “The clinic will tell you what to bring.” The table retrieved in this session showed $2,461/$3,337/$4,212/$5,088 monthly for household sizes 1–4, but no visible effective period was captured. Do not label this table current until its applicability is verified.

**P1 completion:** verify dated income table and household rules; encode categorical income pathways and category durations; source conditional document alternatives; add clinic/phone links. A child already on Medicaid does not make every unrelated household member eligible for WIC.

### 6. Lifeline — phone/internet discount

**Purpose:** a discount on qualifying communication service. Draft value text may use a verified current service-specific cap; otherwise “A discount on qualifying phone or internet service.” Do not describe it as cash.

**Fields:** annual household income/size OR participation in a supported qualifying program; existing Lifeline benefit and program household definition. Unknown participation remains unknown. SNAP eligibility suggested by this app is not actual SNAP enrollment and cannot trigger the participation pathway.

**Sources:** [USAC qualification rules](https://www.lifelinesupport.org/how-to-qualify/) list an income route at 135% of federal poverty guidelines and participation routes. Retrieved 2026 annual amounts for the contiguous states include $21,546/$29,214/$36,882/$44,550 for households 1–4, with $7,668 per additional member after the published table. [USAC FAQ](https://www.lifelinesupport.org/faqs/) distinguishes internet/bundled and voice-only discounts. [USAC state-routing brochure](https://www.lifelinesupport.org/wp-content/uploads/documents/community-education/StatePUC-Brochure.pdf) points Texas applicants to [Texas Lifeline](https://www.texaslifeline.org/); confirm that destination and present-day state process before release.

**Action packet:** review Texas instructions, prepare income OR qualifying-program evidence if requested, and contact a participating provider. One discount per economic household is an important caveat; sharing an address does not alone determine household membership. Tribal and survivor exceptions should be explicit official-referral pathways unless separately implemented and reviewed.

**P1 completion:** transcribe the full current table and incremental rule, exact participation enum, household caveat, service-specific value, state application route, and conditional proof alternatives. Never route all Texas residents blindly to the national application form.

## Acquisition and verification procedure

For each program task, perform these subtasks in order; the phase task cannot be checked until each is complete:

- [ ] Open official source pages and their application/document/rule links; save URL, title, retrieval date and relevant section.
- [ ] Extract minimal factual records manually; record dates, jurisdiction, income definition, units, exception paths, and whether a number is a maximum or example.
- [ ] Write 2–4 plain summary criteria plus granular machine-evaluable predicates; incomplete rules remain unknown/referral.
- [ ] Attach source IDs to every threshold, caveat, value, document and application link; record exact supported scope.
- [ ] Create boundary fixtures and compare the encoded table against the source row by row.
- [ ] Check the application path in a browser without submitting personal data; mark access failures for review.
- [ ] Review all unsupported/draft claims, approve the entry, and record reviewer/date/hash in the manifest.

A 403 is not proof a link is dead or that its contents were verified. Use an ordinary browser or alternate official publication, record the outcome, and block numeric rule publication if ambiguity remains. Never copy a prior-year threshold solely because a current page is blocked.

## Data quality gate

All six entries must be published, with no unresolved evidence for enabled numeric rules or mandatory documents. A stale entry is demoted to a clearly labeled official referral; the public release gate fails if a required program cannot provide its promised reviewed screen. Runtime referral remains useful if rules expire after release. Each record must have an actionable official path even when no personal match can be made.

The budget is a small static catalog, not “all benefits data on the internet.” Full coverage here means all six selected programs, their implemented Texas/federal pathways, sourced next steps, known limitations and testable uncertainty behavior. Avoid unsupported national coverage claims.
