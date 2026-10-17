// The sources behind Seilaya's cards. Each card lists the ones it rests on
// (info.ts), and worlds/seilaya/README.md has the full list. Laws are cited
// from their official text; statistics from the agency that publishes them.

export type RefKey =
  | "ra11313"
  | "ra9710"
  | "pcwGad"
  | "wef2025"
  | "psaWomenMen"
  | "ohchrBornFree"
  | "yogyakarta10"
  | "cozens2015"
  | "rightToBe"
  | "blackwell2019"
  | "freeman2022"
  | "maloney2021"
  | "drexelAcostaSison"
  | "upOrosa"
  | "philstarCruz"
  | "upDelMundo";

export interface Reference {
  short: string;
  full: string;
  url?: string;
}

export const REFERENCES: Record<RefKey, Reference> = {
  ra11313: {
    short: "Safe Spaces Act (RA 11313)",
    full: "Republic of the Philippines. (2019, April 17). Republic Act No. 11313: Safe Spaces Act. Official Gazette.",
    url: "https://www.officialgazette.gov.ph/downloads/2019/04apr/20190417-RA-11313-RRD.pdf",
  },
  ra9710: {
    short: "Magna Carta of Women (RA 9710)",
    full: "Republic of the Philippines. (2009, August 14). Republic Act No. 9710: The Magna Carta of Women. Senate of the Philippines issuances library copy.",
    url: "https://issuances-library.senate.gov.ph/sites/default/files/2023-02/ra%25209710.pdf",
  },
  pcwGad: {
    short: "PCW, GAD budget call",
    full: "Philippine Commission on Women. (2025). Memorandum Circular No. 2025-06: Preparation and online submission of FY 2026 gender and development (GAD) plans and budget.",
    url: "https://pcw.gov.ph/pcw-memorandum-circular-no-2025-06-preparation-and-online-submission-of-fiscal-year-fy-2026-gender-and-development-gad-plans-and-budget/",
  },
  wef2025: {
    short: "WEF, Global Gender Gap Report 2025",
    full: "World Economic Forum. (2025). Global Gender Gap Report 2025. Philippine results as reported by the Philippine Commission on Women (2025), \"PH reclaims spot in global top 20, remains Asia's leader in gender equality.\"",
    url: "https://pcw.gov.ph/ph-reclaims-spot-in-global-top-20-remains-asias-leader-in-gender-equality/",
  },
  psaWomenMen: {
    short: "PSA, 2024 fact sheet on women and men",
    full: "Philippine Statistics Authority. (2024). Work and economic participation: 2024 fact sheet on women and men (labor force participation from the 2021 Labor Force Survey).",
    url: "https://psa.gov.ph/sites/default/files/phdsd/Work%20and%20Economic%20Participation%202024%20Fact%20Sheet%20on%20Women%20and%20Men_0.pdf",
  },
  ohchrBornFree: {
    short: "UN OHCHR, Born Free and Equal (2019)",
    full: "United Nations Office of the High Commissioner for Human Rights. (2019). Born free and equal: Sexual orientation, gender identity and sex characteristics in international human rights law (2nd ed.).",
    url: "https://digitallibrary.un.org/record/3974380",
  },
  yogyakarta10: {
    short: "Yogyakarta Principles plus 10 (2017)",
    full: "The Yogyakarta Principles plus 10. (2017). Additional principles and state obligations on the application of international human rights law in relation to sexual orientation, gender identity, gender expression and sex characteristics.",
    url: "https://yogyakartaprinciples.org/principles-en/yp10/",
  },
  cozens2015: {
    short: "Cozens & Love (2015)",
    full: "Cozens, P., & Love, T. (2015). A review and current status of crime prevention through environmental design (CPTED). Journal of Planning Literature, 30(4), 393–412.",
    url: "https://doi.org/10.1177/0885412215595440",
  },
  rightToBe: {
    short: "Right To Be, the 5Ds",
    full: "Right To Be. The 5Ds of bystander intervention: Distract, Delegate, Document, Delay, Direct.",
    url: "https://righttobe.org/youth/",
  },
  blackwell2019: {
    short: "Blackwell et al. (2019)",
    full: "Blackwell, L., Ellison, N., Elliott-Deflo, N., & Schwartz, R. (2019). Harassment in social virtual reality: Challenges for platform governance. Proceedings of the ACM on Human-Computer Interaction, 3(CSCW), 1–25.",
    url: "https://doi.org/10.1145/3359202",
  },
  freeman2022: {
    short: "Freeman et al. (2022)",
    full: "Freeman, G., Zamanifard, S., Maloney, D., & Acena, D. (2022). Disturbing the peace: Experiencing and mitigating emerging harassment in social virtual reality. Proceedings of the ACM on Human-Computer Interaction, 6(CSCW1), 1–30.",
    url: "https://doi.org/10.1145/3512932",
  },
  maloney2021: {
    short: "Maloney, Freeman & Robb (2021)",
    full: "Maloney, D., Freeman, G., & Robb, A. (2021). Social virtual reality: Ethical considerations and future directions for an emerging research space. 2021 IEEE Conference on Virtual Reality and 3D User Interfaces Abstracts and Workshops (VRW), 271–277.",
    url: "https://doi.org/10.1109/VRW52623.2021.00056",
  },
  drexelAcostaSison: {
    short: "Drexel University College of Medicine",
    full: "Drexel University College of Medicine. The mother of Philippine obstetrics: Honoria Acosta-Sison.",
    url: "https://drexel.edu/medicine/about/community-health-and-inclusive-excellence/ochie-blog/the-mother-of-philippine-obstetrics-honoria-acosta-sison",
  },
  upOrosa: {
    short: "UP Diliman OICA",
    full: "University of the Philippines Diliman, Office for Initiatives in Culture and the Arts. Commemorations: María Y. Orosa and Fe del Mundo.",
    url: "https://oica.upd.edu.ph/category/commemorations/",
  },
  philstarCruz: {
    short: "Philippine Star (2008); FlipScience",
    full: "Philippine Star. (2008, January 14). 2 RP scientists honored; FlipScience, National Scientist Dr. Lourdes J. Cruz.",
    url: "https://www.flipscience.ph/news/features-news/features/national-scientist-lourdes-j-cruz/",
  },
  upDelMundo: {
    short: "UP Diliman OICA",
    full: "University of the Philippines Diliman, Office for Initiatives in Culture and the Arts. Fe del Mundo, the first woman named National Scientist of the Philippines (1980).",
    url: "https://oica.upd.edu.ph/category/commemorations/",
  },
};
