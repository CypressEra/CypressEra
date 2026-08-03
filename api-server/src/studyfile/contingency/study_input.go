package contingency

// StudyInput is the study-driven `solve-contingency` request (delegation
// mode, change `port-studyfile-to-flow-solver`): the engine parses and
// resolves the study files itself, so the api-server passes paths instead of
// assembling the numeric spec. This file survives the retirement of the
// input-side package (BuildInput et al.).

// StudyPaths carries the session's study-file paths.
type StudyPaths struct {
	Sub string `json:"sub,omitempty"`
	Mon string `json:"mon,omitempty"`
	Con string `json:"con,omitempty"`
}

// StudyInput is marshalled to the command's `--input` JSON.
type StudyInput struct {
	Base     interface{}            `json:"base"`
	Config   map[string]interface{} `json:"config,omitempty"`
	Settings *Settings              `json:"settings,omitempty"`
	Study    StudyPaths             `json:"study"`
}
