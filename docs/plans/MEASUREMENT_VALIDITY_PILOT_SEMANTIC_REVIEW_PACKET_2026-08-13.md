# Measurement Validity Development Pilot v1 — Semantic Review Packet

日期：2026-08-13（Day 1）
状态：**REVIEW PENDING — 等待 owner 审查**。Claude Code 不为自己生成的 paraphrase / option map / evidence ladder 签署 accepted semantic review。
权威指南：[CLAUDE_CODE_THREE_DAY_MEASUREMENT_PILOT_PLAN_2026-08-13.md](../archive/plans/CLAUDE_CODE_THREE_DAY_MEASUREMENT_PILOT_PLAN_2026-08-13.md)

## 0. 用途与 Gate

本 packet 是 Day 1 的人工 Gate 产物。Owner 需在每条 cluster 上给出 `accept / reject / merge / revise` 决定；
只有 owner 显式接受后，`measurementPilotExecutionV1.ts` 才会写入 `status:"accepted"` 并允许构建冻结 plan（当前构建是 fail-closed，任何未接受项都抛错）。
没有 owner 决定时：只允许 plan/mock，**禁止真实 provider run**。

- review protocol ref：`swarmalpha.review.measurement-pilot-semantic@1.0.0`
- 候选顺序（冻结）：1, 9, 10, 11, 12, 15, 16, 18, 21, 13, 31, 5, 7, 8, 14, 30, 57, 59, 60, 61, 62, 64, 65
- 已选 cluster 数：20/20；insufficientClusterSupport=false
- 每个 cluster 的 truth 元数据（designatedTarget == resolution）**只在 authority/reviewer 侧**，绝不进入 provider request。

## 1. Reviewer 检查清单（每条 cluster 逐项核对）

1. **paraphrase**：是否只改表达，不改 claim options、resolution policy、信息集合（shared/private facts）与角色权限；
2. **option map**：是否 canonical bijection（displayed→canonical 覆盖全部选项、单射、映回后集合不变）；
3. **evidence strength**：weak < medium < strong 是否在语义上确实递增（本包为确定性机械候选，**必须人工确认真实强度序**，机械句子未必语义递增）；
4. **counter**：是否对同一 designatedTarget 的**反向证据**，而不是另起一个任意论断；机械候选常需 revise 成真正的反向事实；
5. **meta-language**：payload 不得写出 `ground truth / resolver outcome / 正确答案是 X / is correct` 等指向特定选项的元语言；
6. **leakage group**：建议的 syntactic group 是否可作为独立 cluster；同模板实例不得冒充独立 N；
7. **task 30 注意**：其 description 含 "The correct answer is the one that…" 的良性框架句（不指向具体选项），reviewer 需判断是否保留。

## 2. 每 cluster 候选详情

> designatedTarget 列只供 reviewer，绝不进入 provider request。evidence payload 为**机械候选**：结构与 target 正确，但真实证据强度与反向性需 reviewer 判定。

### Cluster cluster:pilot:1 — HiddenBench task 1 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 1 (evacuation_west_city).
- options: West City | East Town | North Hill
- suggested leakage group: `hiddenbench:description:498b908cf8bdf7cfbd1b510ef782a4b99f5bdda5a33fec1f8da0aa0f33994be8`
- paraphrase diff: base=`You are participating in a study, acting as a community leader of a small village surround…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"East Town":"West City","North Hill":"East Town","West City":"North Hill"}`
- evidence[weak:1] target="West City" payload=`Consider the following observation: Most villagers own cars, but there are also elderly people and children who may need additional assistan…`
- evidence[medium:2] target="West City" payload=`Observation: Earlier today, heavy rain began to fall, and the local government issued a warning about a potential disaster. This observation…`
- evidence[strong:3] target="West City" payload=`Observations: Most villagers own cars, but there are also elderly people and children who may need additional assistance when walking. Earli…`
- evidence[counter] target="West City" payload=`Observation: You are participating in a study, acting as a community leader of a small village surrounded by mountains and rivers. This obse…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:2 — HiddenBench task 9 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 9 (critical_hospital_transfer).
- options: Hospital A | Hospital B | Hospital C
- suggested leakage group: `hiddenbench:description:53790f78ccfc919647f4295425106b3680b100b6e84ddb229791d8604f09e63a`
- paraphrase diff: base=`You are on the hospital staff of a rural clinic. A young patient has collapsed with sympto…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Hospital B":"Hospital A","Hospital C":"Hospital B","Hospital A":"Hospital C"}`
- evidence[weak:1] target="Hospital B" payload=`Consider the following observation: A young patient has collapsed with symptoms of a rare but treatable illness. This observation may or may…`
- evidence[medium:2] target="Hospital B" payload=`Observation: The patient needs to be transferred immediately to a hospital with advanced ICU facilities. This observation is most consistent…`
- evidence[strong:3] target="Hospital B" payload=`Observations: A young patient has collapsed with symptoms of a rare but treatable illness. The patient needs to be transferred immediately t…`
- evidence[counter] target="Hospital B" payload=`Observation: You are on the hospital staff of a rural clinic. This observation is inconsistent with "Hospital B".…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:3 — HiddenBench task 10 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 10 (emergency_supply_drop).
- options: Warehouse A | Warehouse B | Warehouse C
- suggested leakage group: `hiddenbench:description:03e61da14cd61335bae9448b71f455534ec3838c236a267e77540daf5a490de4`
- paraphrase diff: base=`You are emergency logistics coordinators tasked with directing a supply plane loaded with …` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Warehouse B":"Warehouse A","Warehouse C":"Warehouse B","Warehouse A":"Warehouse C"}`
- evidence[weak:1] target="Warehouse C" payload=`Consider the following observation: All main roads are partially blocked, but the pilot can reach any warehouse—they just need a quick decis…`
- evidence[medium:2] target="Warehouse C" payload=`Observation: Your team must choose the best landing site from among the three warehouses: Warehouse A (north side, near a river crossing); W…`
- evidence[strong:3] target="Warehouse C" payload=`Observations: All main roads are partially blocked, but the pilot can reach any warehouse—they just need a quick decision on where it's safe…`
- evidence[counter] target="Warehouse C" payload=`Observation: You are emergency logistics coordinators tasked with directing a supply plane loaded with water, food, and medicine to land at …`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:4 — HiddenBench task 11 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 11 (emergency_conference_relocation).
- options: City Library | Community Center | School Gym
- suggested leakage group: `hiddenbench:description:419b974db2410f60185be76c6dcc31b3610f1f8e63d10e7a69a98797129ae5c4`
- paraphrase diff: base=`You are on a committee responsible for an emergency scientific conference that suddenly lo…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Community Center":"City Library","School Gym":"Community Center","City Library":"School Gym"}`
- evidence[weak:1] target="City Library" payload=`Consider the following observation: You must relocate all attendees within the next two hours—if you can't agree, the event will be canceled…`
- evidence[medium:2] target="City Library" payload=`Observation: Three possible venues are nearby: City Library, Community Center, and School Gym. This observation is most consistent with "Cit…`
- evidence[strong:3] target="City Library" payload=`Observations: You must relocate all attendees within the next two hours—if you can't agree, the event will be canceled. Three possible venue…`
- evidence[counter] target="City Library" payload=`Observation: You are on a committee responsible for an emergency scientific conference that suddenly lost its main venue due to a water pipe…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:5 — HiddenBench task 12 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 12 (evacuate_park_dilemma).
- options: Blueberry Ridge | Green Valley | Red Lake
- suggested leakage group: `hiddenbench:description:bbe27e8e202c45ccb889e2b7876399e66d2b73d40ba8fba47a40412aa0a0a960`
- paraphrase diff: base=`You are serving on an emergency planning team for a scenic region hosting a national outdo…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Green Valley":"Blueberry Ridge","Red Lake":"Green Valley","Blueberry Ridge":"Red Lake"}`
- evidence[weak:1] target="Green Valley" payload=`Consider the following observation: As thunderstorms approach, authorities must evacuate everyone to safety. This observation may or may not…`
- evidence[medium:2] target="Green Valley" payload=`Observation: There are three official evacuation locations, all reportedly equipped and expecting displaced guests: Blueberry Ridge (a woodl…`
- evidence[strong:3] target="Green Valley" payload=`Observations: As thunderstorms approach, authorities must evacuate everyone to safety. There are three official evacuation locations, all re…`
- evidence[counter] target="Green Valley" payload=`Observation: You are serving on an emergency planning team for a scenic region hosting a national outdoor festival. This observation is inco…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:6 — HiddenBench task 15 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 15 (artifact_safe_haven).
- options: City Bank | University Library | Downtown Police Station
- suggested leakage group: `hiddenbench:description:e99be5d11bbf6f6b873b2c02bff5f5a9b0104f77cb4c69eeb80af8987fe89b41`
- paraphrase diff: base=`A priceless ancient artifact has just been unearthed in your city. Authorities task your t…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"University Library":"City Bank","Downtown Police Station":"University Library","City Bank":"Downtown Police Station"}`
- evidence[weak:1] target="City Bank" payload=`Consider the following observation: Authorities task your team with deciding where to safely store it for 24 hours until the national museum…`
- evidence[medium:2] target="City Bank" payload=`Observation: The city is experiencing rising river levels after days of storms, and several neighborhoods have intermittent power outages. T…`
- evidence[strong:3] target="City Bank" payload=`Observations: Authorities task your team with deciding where to safely store it for 24 hours until the national museum can collect it. The c…`
- evidence[counter] target="City Bank" payload=`Observation: A priceless ancient artifact has just been unearthed in your city. This observation is inconsistent with "City Bank".…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:7 — HiddenBench task 16 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 16 (Crisis Backup Decision).
- options: Alpha | Bravo | Charlie
- suggested leakage group: `hiddenbench:description:465305216e522ea8c32dde1e2a2905a446b418c760882f447f85c7da3a9b846d`
- paraphrase diff: base=`Your company’s IT systems have just suffered a major ransomware attack. Senior management …` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Bravo":"Alpha","Charlie":"Bravo","Alpha":"Charlie"}`
- evidence[weak:1] target="Charlie" payload=`Consider the following observation: Senior management is demanding you make an immediate group decision: choose where to send the next full …`
- evidence[medium:2] target="Charlie" payload=`Observation: You have contracts in place with three geographically separate data centers—Alpha, Bravo, and Charlie—each with a track record …`
- evidence[strong:3] target="Charlie" payload=`Observations: Senior management is demanding you make an immediate group decision: choose where to send the next full backup copy of all sys…`
- evidence[counter] target="Charlie" payload=`Observation: Your company’s IT systems have just suffered a major ransomware attack. This observation is inconsistent with "Charlie".…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:8 — HiddenBench task 18 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 18 (choosing_base_camp).
- options: Camp Summit | Camp Pinecone | Camp Meadow
- suggested leakage group: `hiddenbench:description:2ddf9af749a937ff3f4fd9f6c2fdef6ff972ccd70f9cfa9af7691b1ff3e8428e`
- paraphrase diff: base=`You are leaders of a multi-national research expedition in a mountainous region planning t…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Camp Pinecone":"Camp Summit","Camp Meadow":"Camp Pinecone","Camp Summit":"Camp Meadow"}`
- evidence[weak:1] target="Camp Summit" payload=`Consider the following observation: There are three candidate spots: Camp Summit (high ground near a glacier), Camp Pinecone (forest edge ne…`
- evidence[medium:2] target="Camp Summit" payload=`Observation: Each has some historical data and rumored risks, but no location is perfect. This observation is most consistent with "Camp Sum…`
- evidence[strong:3] target="Camp Summit" payload=`Observations: There are three candidate spots: Camp Summit (high ground near a glacier), Camp Pinecone (forest edge near a river), and Camp …`
- evidence[counter] target="Camp Summit" payload=`Observation: You are leaders of a multi-national research expedition in a mountainous region planning to set up your central base camp for a…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:9 — HiddenBench task 21 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 21 (emergency_transportation_decision).
- options: Aurora Train Station | Borealis Bus Terminal | Celestia Airstrip
- suggested leakage group: `hiddenbench:description:db050ac84490b8c3e424e720bcc72b884dbb8d3552aebfcd8e195d9443b0a981`
- paraphrase diff: base=`You are coordinators transporting a group of volunteers to deliver urgent medical supplies…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Borealis Bus Terminal":"Aurora Train Station","Celestia Airstrip":"Borealis Bus Terminal","Aurora Train Station":"Celestia Airstrip"}`
- evidence[weak:1] target="Celestia Airstrip" payload=`Consider the following observation: Friday evening, heavy storms have blocked local highways, and lodging spots may fill quickly. This obser…`
- evidence[medium:2] target="Celestia Airstrip" payload=`Observation: You have three possible destinations with different transportation modes:
- Aurora Train Station
- Borealis Bus Terminal
- Cele…`
- evidence[strong:3] target="Celestia Airstrip" payload=`Observations: Friday evening, heavy storms have blocked local highways, and lodging spots may fill quickly. You have three possible destinat…`
- evidence[counter] target="Celestia Airstrip" payload=`Observation: You are coordinators transporting a group of volunteers to deliver urgent medical supplies and food to a remote village experie…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:10 — HiddenBench task 13 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 13 (Laboratory Theft Deduction).
- options: Lab Alpha | Lab Beta | Lab Gamma
- suggested leakage group: `hiddenbench:description:5e70729745820202fdbe854dfa3ecc4bc1e0f8429b27aa8fa469686731fafa51`
- paraphrase diff: base=`You are members of a security review panel at a major university, investigating the theft …` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Lab Beta":"Lab Alpha","Lab Gamma":"Lab Beta","Lab Alpha":"Lab Gamma"}`
- evidence[weak:1] target="Lab Alpha" payload=`Consider the following observation: The theft took place during a two-hour window last night, and records show only three labs had access to…`
- evidence[medium:2] target="Lab Alpha" payload=`Observation: University leadership wants you to identify the lab responsible for the theft before pressing charges. This observation is most…`
- evidence[strong:3] target="Lab Alpha" payload=`Observations: The theft took place during a two-hour window last night, and records show only three labs had access to the secure vault. Uni…`
- evidence[counter] target="Lab Alpha" payload=`Observation: You are members of a security review panel at a major university, investigating the theft of a prototype device from a tightly …`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:11 — HiddenBench task 31 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 31 (weather_sensor_deployment).
- options: Alpha Ridge | Beta Valley | Gamma Lake
- suggested leakage group: `hiddenbench:description:e5f719167bb1f3d0d3bfdd235b906774f487e1508ec3f5f4fd83d0f49c6d02c3`
- paraphrase diff: base=`You are part of a scientific team deployed to investigate unusual atmospheric phenomena. Y…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Beta Valley":"Alpha Ridge","Gamma Lake":"Beta Valley","Alpha Ridge":"Gamma Lake"}`
- evidence[weak:1] target="Gamma Lake" payload=`Consider the following observation: You must quickly decide at which of three sites to install your advanced weather sensor. This observatio…`
- evidence[medium:2] target="Gamma Lake" payload=`Observation: Each site comes with advantages and risks. This observation is most consistent with "Gamma Lake" among the options.…`
- evidence[strong:3] target="Gamma Lake" payload=`Observations: You must quickly decide at which of three sites to install your advanced weather sensor. Each site comes with advantages and r…`
- evidence[counter] target="Gamma Lake" payload=`Observation: You are part of a scientific team deployed to investigate unusual atmospheric phenomena. This observation is inconsistent with …`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:12 — HiddenBench task 5 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 5 (baker_2010).
- options: Stevens | Roberts | Jones
- suggested leakage group: `hiddenbench:description:d6fdb219d2a3642c185d19e753d572c6f930cea739ba1051afa1ed30f30b1696`
- paraphrase diff: base=`You are participating in a study and are on the search team for a new president of Higher …` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Roberts":"Stevens","Jones":"Roberts","Stevens":"Jones"}`
- evidence[weak:1] target="Stevens" payload=`Consider the following observation: Highlights fromthe job posting are provided below. This observation may or may not relate to "Stevens".…`
- evidence[medium:2] target="Stevens" payload=`Observation: Three candidates have applied and information that you have gathered from resumes, reference checks, candidate interviews, and …`
- evidence[strong:3] target="Stevens" payload=`Observations: Highlights fromthe job posting are provided below. Three candidates have applied and information that you have gathered from r…`
- evidence[counter] target="Stevens" payload=`Observation: You are participating in a study and are on the search team for a new president of Higher Education University, a private liber…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:13 — HiddenBench task 7 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 7 (graetz_et_al_1998).
- options: Franklin Enterprises | Starlight Incorporated | Cape Industries
- suggested leakage group: `hiddenbench:description:38d855d281e8b43ddfa761bfca80bb6fb0aa3d6c7c128940fadb6edb12605f41`
- paraphrase diff: base=`You are participating in a study, acting as a member of purchasing executives reviewing th…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Starlight Incorporated":"Franklin Enterprises","Cape Industries":"Starlight Incorporated","Franklin Enterprises":"Cape Industries"}`
- evidence[weak:1] target="Starlight Incorporated" payload=`Consider the following observation: The new system was to include two parts: an air vehicle and an on board computer. This observation may o…`
- evidence[medium:2] target="Starlight Incorporated" payload=`Observation: Please read the request for proposals (RFP) and a check-list of information taken from proposals submitted by three companies: …`
- evidence[strong:3] target="Starlight Incorporated" payload=`Observations: The new system was to include two parts: an air vehicle and an on board computer. Please read the request for proposals (RFP) …`
- evidence[counter] target="Starlight Incorporated" payload=`Observation: You are participating in a study, acting as a member of purchasing executives reviewing three proposals for a new airborne reco…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:14 — HiddenBench task 8 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 8 (Stasser_Stewart_1992).
- options: Eddie Sullivan | Billy Prentice | Mickey Malone
- suggested leakage group: `hiddenbench:description:2fbbcd51c2f7a1174704dcef3b32ae7061755b63a38667371acaf8dc1ee440f0`
- paraphrase diff: base=`You are participating in a study, acting as an investigator in a murder case. Your goal is…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Billy Prentice":"Eddie Sullivan","Mickey Malone":"Billy Prentice","Eddie Sullivan":"Mickey Malone"}`
- evidence[weak:1] target="Billy Prentice" payload=`Consider the following observation: Your goal is to figure out who killed Mr. This observation may or may not relate to "Billy Prentice".…`
- evidence[medium:2] target="Billy Prentice" payload=`Observation: Guion, a well-known car company owner. This observation is most consistent with "Billy Prentice" among the options.…`
- evidence[strong:3] target="Billy Prentice" payload=`Observations: Your goal is to figure out who killed Mr. Guion, a well-known car company owner. The Incident:
Mr. Together these observations…`
- evidence[counter] target="Billy Prentice" payload=`Observation: You are participating in a study, acting as an investigator in a murder case. This observation is inconsistent with "Billy Pren…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:15 — HiddenBench task 14 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 14 (lunch_group_decision).
- options: Restaurant A | Restaurant B | Restaurant C
- suggested leakage group: `hiddenbench:description:6ee9b6d0c1963db431729dd3f0b7f5f6e823b0fe3f561d2f1ba7a245391a3abd`
- paraphrase diff: base=`You are a group of colleagues tasked with deciding where to host your team's celebratory l…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Restaurant B":"Restaurant A","Restaurant C":"Restaurant B","Restaurant A":"Restaurant C"}`
- evidence[weak:1] target="Restaurant C" payload=`Consider the following observation: The team includes vegetarians and one person with a severe shellfish allergy, all prefer a quiet atmosph…`
- evidence[medium:2] target="Restaurant C" payload=`Observation: You have three choices: Restaurant A, Restaurant B, and Restaurant C. This observation is most consistent with "Restaurant C" a…`
- evidence[strong:3] target="Restaurant C" payload=`Observations: The team includes vegetarians and one person with a severe shellfish allergy, all prefer a quiet atmosphere, and no one has a …`
- evidence[counter] target="Restaurant C" payload=`Observation: You are a group of colleagues tasked with deciding where to host your team's celebratory lunch. This observation is inconsisten…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:16 — HiddenBench task 30 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 30 (the_lead_investor_decision).
- options: Peak Capital | Skylake Ventures | Northstar Partners
- suggested leakage group: `hiddenbench:description:57a467a96ab92934bb33f190b19012b908d35ba73ddaff065021bc4b5bb24899`
- paraphrase diff: base=`You are co-founders of a startup that just received three offers from venture capital firm…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Skylake Ventures":"Peak Capital","Northstar Partners":"Skylake Ventures","Peak Capital":"Northstar Partners"}`
- evidence[weak:1] target="Peak Capital" payload=`Consider the following observation: Time is tight—you must select a lead investor within 12 hours to avoid losing all momentum. This observa…`
- evidence[medium:2] target="Peak Capital" payload=`Observation: There are three possible firms: Peak Capital, Skylake Ventures, and Northstar Partners. This observation is most consistent wit…`
- evidence[strong:3] target="Peak Capital" payload=`Observations: Time is tight—you must select a lead investor within 12 hours to avoid losing all momentum. There are three possible firms: Pe…`
- evidence[counter] target="Peak Capital" payload=`Observation: You are co-founders of a startup that just received three offers from venture capital firms to lead your Series B funding round…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:17 — HiddenBench task 57 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 57 (archaeological_dig_site).
- options: Site A | Site B | Site C
- suggested leakage group: `hiddenbench:description:8e8fd5b99e3321c09ca974dac369cb5607370fed467ffe165d243f6ac4116f96`
- paraphrase diff: base=`You and three colleagues are archaeologists tasked with selecting a site to salvage crucia…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Site B":"Site A","Site C":"Site B","Site A":"Site C"}`
- evidence[weak:1] target="Site C" payload=`Consider the following observation: There are tight time constraints: you can only pick one location, and you must choose by the end of the …`
- evidence[medium:2] target="Site C" payload=`Observation: There are three candidate sites: Site A, Site B, and Site C. This observation is most consistent with "Site C" among the option…`
- evidence[strong:3] target="Site C" payload=`Observations: There are tight time constraints: you can only pick one location, and you must choose by the end of the hour. There are three …`
- evidence[counter] target="Site C" payload=`Observation: You and three colleagues are archaeologists tasked with selecting a site to salvage crucial artifacts before construction begin…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:18 — HiddenBench task 59 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 59 (last_minute_move).
- options: Alpha Movers | Bravo Moving Co. | Charlie’s Transport
- suggested leakage group: `hiddenbench:description:ba72bafadd0869970f0df737dbdc987a396b27c35dae0e3f9a05e03f4a86b412`
- paraphrase diff: base=`You and three colleagues have been tasked with quickly finding a trustworthy moving compan…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Bravo Moving Co.":"Alpha Movers","Charlie’s Transport":"Bravo Moving Co.","Alpha Movers":"Charlie’s Transport"}`
- evidence[weak:1] target="Alpha Movers" payload=`Consider the following observation: You must book one out of three shortlisted companies in the next 20 minutes to avoid extra costs. This o…`
- evidence[medium:2] target="Alpha Movers" payload=`Observation: Each company claims to be able to complete the move on time and has good reviews. This observation is most consistent with "Alp…`
- evidence[strong:3] target="Alpha Movers" payload=`Observations: You must book one out of three shortlisted companies in the next 20 minutes to avoid extra costs. Each company claims to be ab…`
- evidence[counter] target="Alpha Movers" payload=`Observation: You and three colleagues have been tasked with quickly finding a trustworthy moving company for your employer’s urgent relocati…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:19 — HiddenBench task 60 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 60 (The Elusive Bird Sighting).
- options: Area A (the Oak Woods) | Area B (the Wetland) | Area C (the Meadow)
- suggested leakage group: `hiddenbench:description:6c8e6e370ee50600feb270673cd9868cc72e0aef6a28365fcb2491ed6fa5ecfb`
- paraphrase diff: base=`You are part of a research group searching for the recently spotted rare Bluecrest Thrush …` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Area B (the Wetland)":"Area A (the Oak Woods)","Area C (the Meadow)":"Area B (the Wetland)","Area A (the Oak Woods)":"Area C (the Meadow)"}`
- evidence[weak:1] target="Area A (the Oak Woods)" payload=`Consider the following observation: The park is divided into three main sections: Area A (the Oak Woods), Area B (the Wetland), and Area C (…`
- evidence[medium:2] target="Area A (the Oak Woods)" payload=`Observation: A trusted park ranger reported sighting the bird yesterday at sunrise, but due to heavy fog, the exact location was unclear. Th…`
- evidence[strong:3] target="Area A (the Oak Woods)" payload=`Observations: The park is divided into three main sections: Area A (the Oak Woods), Area B (the Wetland), and Area C (the Meadow). A trusted…`
- evidence[counter] target="Area A (the Oak Woods)" payload=`Observation: You are part of a research group searching for the recently spotted rare Bluecrest Thrush in the large Greenwood Nature Reserve…`
- designatedTarget == resolution: true（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

### Cluster cluster:pilot:20 — HiddenBench task 61 (3be6ca16)
- scenario: Select the single correct answer for HiddenBench task 61 (power_outage_island).
- options: Main Generator Room | Water Pump Facility | Communication Tower
- suggested leakage group: `hiddenbench:description:16a1d14348bb247e8d95383c6549d1cbcf7b8f5393e8aafe5e6256b21d842f17`
- paraphrase diff: base=`You are a four-person technical team sent to a remote research island. Overnight, power wa…` / para=`Carefully consider the following scenario description, then answer the question that follo…`
- canonical option map (displayed -> canonical): `{"Water Pump Facility":"Main Generator Room","Communication Tower":"Water Pump Facility","Main Generator Room":"Communication Tower"}`
- evidence[weak:1] target="Main Generator Room" payload=`Consider the following observation: Overnight, power was lost across critical systems, affecting experiments and communications. This observ…`
- evidence[medium:2] target="Main Generator Room" payload=`Observation: Your mission: identify the location where the root cause began, so specialist engineers can be dispatched directly. This observ…`
- evidence[strong:3] target="Main Generator Room" payload=`Observations: Overnight, power was lost across critical systems, affecting experiments and communications. Your mission: identify the locati…`
- evidence[counter] target="Main Generator Room" payload=`Observation: You are a four-person technical team sent to a remote research island. This observation is inconsistent with "Main Generator Ro…`
- designatedTarget == resolution: false（reviewer-only）
- reviewer: [ ] accept　[ ] reject　[ ] merge　[ ] revise　note: ______

## 3. Reviewer 决定表（回填后作为 owner 决定交给 Claude）

| clusterId | paraphrase | permutation | strength weak/med/strong | counter | leakage group | 决定 |
|---|---|---|---|---|---|---|
| cluster:pilot:1 (task 1) | [ ] | [ ] | [ ] | [ ] | `aa0f33994be8` | ______ |
| cluster:pilot:2 (task 9) | [ ] | [ ] | [ ] | [ ] | `d8604f09e63a` | ______ |
| cluster:pilot:3 (task 10) | [ ] | [ ] | [ ] | [ ] | `0daf5a490de4` | ______ |
| cluster:pilot:4 (task 11) | [ ] | [ ] | [ ] | [ ] | `8797129ae5c4` | ______ |
| cluster:pilot:5 (task 12) | [ ] | [ ] | [ ] | [ ] | `412aa0a0a960` | ______ |
| cluster:pilot:6 (task 15) | [ ] | [ ] | [ ] | [ ] | `f8987fe89b41` | ______ |
| cluster:pilot:7 (task 16) | [ ] | [ ] | [ ] | [ ] | `c7da3a9b846d` | ______ |
| cluster:pilot:8 (task 18) | [ ] | [ ] | [ ] | [ ] | `1b1ff3e8428e` | ______ |
| cluster:pilot:9 (task 21) | [ ] | [ ] | [ ] | [ ] | `5d9443b0a981` | ______ |
| cluster:pilot:10 (task 13) | [ ] | [ ] | [ ] | [ ] | `686731fafa51` | ______ |
| cluster:pilot:11 (task 31) | [ ] | [ ] | [ ] | [ ] | `d0f49c6d02c3` | ______ |
| cluster:pilot:12 (task 5) | [ ] | [ ] | [ ] | [ ] | `ed30f30b1696` | ______ |
| cluster:pilot:13 (task 7) | [ ] | [ ] | [ ] | [ ] | `6edb12605f41` | ______ |
| cluster:pilot:14 (task 8) | [ ] | [ ] | [ ] | [ ] | `f8dc1ee440f0` | ______ |
| cluster:pilot:15 (task 14) | [ ] | [ ] | [ ] | [ ] | `a245391a3abd` | ______ |
| cluster:pilot:16 (task 30) | [ ] | [ ] | [ ] | [ ] | `bc4b5bb24899` | ______ |
| cluster:pilot:17 (task 57) | [ ] | [ ] | [ ] | [ ] | `3f6ac4116f96` | ______ |
| cluster:pilot:18 (task 59) | [ ] | [ ] | [ ] | [ ] | `e03f4a86b412` | ______ |
| cluster:pilot:19 (task 60) | [ ] | [ ] | [ ] | [ ] | `91ed6fa5ecfb` | ______ |
| cluster:pilot:20 (task 61) | [ ] | [ ] | [ ] | [ ] | `56b21d842f17` | ______ |

## 4. 免责与纪律

- 本 packet 由确定性生成器产生，**不构成已接受的 semantic review**；owner 未显式接受前，`reviewFor` 对任何缺失项 fail-closed。
- 机械 evidence payload 的真实强度序与反向性**需要 owner 判断**；owner 可 `revise` 后回填真实证据文本。
- Day 1 报告：0 paid calls、0 credentials read、0 accepted review self-issued。