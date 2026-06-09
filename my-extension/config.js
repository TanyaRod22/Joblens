// Switch apiBaseUrl to your production backend before publishing.
// Example: "https://api.yourdomain.com"
var JOBSCRAPPER_CONFIG = {
  apiBaseUrl: "https://joblens-production-928c.up.railway.app",
  endpoints: {
    analyzeJob: "/analyze-job",
    scoreFit: "/score-fit",
    suggestImprovements: "/suggest-improvements",
    generateColdEmail: "/generate-cold-email",
    generateCoverLetter: "/generate-cover-letter",
    parseResume: "/parse-resume",
  },
};
