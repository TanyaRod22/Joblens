// Switch apiBaseUrl to your production backend before publishing.
// Example: "https://api.yourdomain.com"
const JOBSCRAPPER_CONFIG = {
  apiBaseUrl: "http://localhost:8006",
  endpoints: {
    analyzeJob: "/analyze-job",
    scoreFit: "/score-fit",
    suggestImprovements: "/suggest-improvements",
    generateColdEmail: "/generate-cold-email",
    generateCoverLetter: "/generate-cover-letter",
    parseResume: "/parse-resume",
  },
};
