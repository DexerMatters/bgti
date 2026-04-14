import { useEffect, useMemo, useState } from 'react'
import './App.css'

const DIMENSIONS = ['VJ', 'IC', 'RS', 'GS', 'GD', 'FD'] as const
type Dimension = (typeof DIMENSIONS)[number]

type Remark = {
  tagline: string
  description: string
  strengths: string[]
  blind_spots: string[]
}

type Question = {
  id: number
  statement: string
  dimension: Dimension
  // 7 values for scale positions [-3,-2,-1,0,+1,+2,+3]
  // positive → toward left pole (V/I/R/T/L/E/N/F), negative → right pole
  weights: [number, number, number, number, number, number, number]
  pole?: string
  trait?: string
  trait_description?: string
  context?: 'game' | 'life'
}

const SCALE_VALUES = [-3, -2, -1, 0, 1, 2, 3] as const

const traitHint: Record<string, string> = {
  V: '制胜者',
  J: '同乐者',
  I: '直觉家',
  C: '精算师',
  R: '冒险者',
  S: '稳健者',
  T: '沉浸派',
  M: '策略派',
  E: '探索派',
  X: '精研派',
  F: '派对控',
  D: '沉浸者',
}

const DIMENSION_POLES: Record<Dimension, [string, string]> = {
  VJ: ['V', 'J'],
  IC: ['I', 'C'],
  RS: ['R', 'S'],
  GS: ['T', 'M'],
  GD: ['E', 'X'],
  FD: ['F', 'D'],
}

const DIMENSION_NAMES: Record<Dimension, string> = {
  VJ: '目标取向',
  IC: '决策风格',
  RS: '风险偏好',
  GS: '游戏格调',
  GD: '游戏投入',
  FD: '社交强度',
}

const buildSummary = (picks: Array<{ dimension: string; winner: string }>) => {
  const w = Object.fromEntries(picks.map((p) => [p.dimension, p.winner]))
  return [
    w.VJ === 'V' ? '在乎胜负' : '享受过程',
    w.IC === 'I' ? '凭直觉出牌' : '精算后落子',
    w.RS === 'R' ? '爱搏险棋' : '守住局面',
    w.GS === 'T' ? '沉浸于叙事与戏剧感' : '追求规则精妙与策略深度',
    w.GD === 'E' ? '广泛探索轻量游戏' : '深度精研少数游戏',
    w.FD === 'F' ? '游戏是社交的载体' : '上桌就全情投入',
  ].join('，') + '。'
}

const isQuestion = (value: unknown): value is Question => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Question>
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.statement === 'string' &&
    DIMENSIONS.includes(candidate.dimension as Dimension) &&
    Array.isArray(candidate.weights) &&
    candidate.weights.length === 7 &&
    (candidate.weights as unknown[]).every((w) => typeof w === 'number')
  )
}

// Pip positions (cx, cy) normalized 0–1 within the die face
const FACE_PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.73, 0.27], [0.27, 0.73]],
  3: [[0.73, 0.27], [0.5, 0.5], [0.27, 0.73]],
}

type DieFaceProps = { value: number; pressed: boolean; onClick: () => void }

function DieFace({ value, pressed, onClick }: DieFaceProps) {
  const face = Math.abs(value) // -3→3, -2→2, -1→1, 0→0, +1→1, +2→2, +3→3
  const pips = FACE_PIPS[face] ?? []
  const side = value < 0 ? 'die-disagree' : value > 0 ? 'die-agree' : 'die-neutral'
  return (
    <button
      className={`die-face ${side}${pressed ? ' die-selected' : ''}`}
      onClick={onClick}
      aria-label={`选择 ${value}`}
      aria-pressed={pressed}
    >
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        {pips.map(([cx, cy], i) => (
          <circle key={i} cx={cx * 44} cy={cy * 44} r={4} className="die-pip" />
        ))}
      </svg>
    </button>
  )
}

function App() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [remarks, setRemarks] = useState<Record<string, Remark>>({})
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [started, setStarted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadQuestions = async () => {
      try {
        const response = await fetch('/questions.json')
        if (!response.ok) {
          throw new Error('题目文件加载失败。')
        }

        const raw: unknown = await response.json()
        const candidates: unknown[] =
          Array.isArray(raw)
            ? raw
            : raw !== null &&
              typeof raw === 'object' &&
              Array.isArray((raw as Record<string, unknown>).questions)
              ? ((raw as Record<string, unknown>).questions as unknown[])
              : []

        if (candidates.length === 0 || candidates.some((item) => !isQuestion(item))) {
          throw new Error('题目格式有误，请检查 JSON 结构。')
        }

        if (active) {
          setQuestions(candidates as Question[])
          setLoading(false)
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : '无法加载题目，请稍后重试。'
          )
          setLoading(false)
        }
      }
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    fetch('/remarks.json')
      .then((r) => r.json())
      .then((data: Record<string, Remark>) => setRemarks(data))
      .catch(() => { })
  }, [])

  const answeredCount = useMemo(
    () => Object.keys(answers).length,
    [answers]
  )
  const totalQuestions = questions.length
  const isFinished = totalQuestions > 0 && questions.every((q) => typeof answers[q.id] === 'number')
  const progress = totalQuestions === 0 ? 0 : (answeredCount / totalQuestions) * 100

  const currentQuestion =
    currentIndex >= 0 && currentIndex < totalQuestions
      ? questions[currentIndex]
      : null
  const currentAnswer =
    currentQuestion && answers[currentQuestion.id] !== undefined
      ? answers[currentQuestion.id]
      : null

  const result = useMemo(() => {
    if (!isFinished) return null

    const totals: Record<Dimension, number> = {
      VJ: 0, IC: 0, RS: 0, GS: 0, GD: 0, FD: 0,
    }
    const maxTotals: Record<Dimension, number> = {
      VJ: 0, IC: 0, RS: 0, GS: 0, GD: 0, FD: 0,
    }

    for (const question of questions) {
      // max possible contribution = largest absolute value in the weights array
      maxTotals[question.dimension] += Math.max(...question.weights.map((w) => Math.abs(w)))
      const answer = answers[question.id]
      if (typeof answer === 'number') {
        // answer ∈ [-3,3], map to index 0-6
        totals[question.dimension] += question.weights[answer + 3]
      }
    }

    const picks = DIMENSIONS.map((dimension) => {
      const [first, second] = DIMENSION_POLES[dimension]
      const score = totals[dimension]
      const max = maxTotals[dimension] || 1
      const winner = score >= 0 ? first : second
      const loser = score >= 0 ? second : first
      const leaning = Math.min(100, Math.round((Math.abs(score) / max) * 100))
      const tied = leaning === 0
      return {
        dimension,
        winner,
        loser,
        leaning,
        tied,
      }
    })

    const type = picks.map((item) => item.winner).join('')
    const summary = buildSummary(picks)

    return { type, picks, summary }
  }, [answers, isFinished, questions])

  const answerQuestion = (value: number) => {
    if (!currentQuestion) return

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: value,
    }))

    if (currentIndex < totalQuestions - 1) {
      setDirection('forward')
      setCurrentIndex((previous) => previous + 1)
    }
  }

  const goToPrevious = () => {
    setDirection('back')
    setCurrentIndex((previous) => Math.max(0, previous - 1))
  }

  const goToNext = () => {
    setDirection('forward')
    setCurrentIndex((previous) => Math.min(totalQuestions - 1, previous + 1))
  }

  const startOver = () => {
    setAnswers({})
    setCurrentIndex(0)
    setStarted(false)
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <header className="top">
          <div>
            <p className="eyebrow">BGTI</p>
            <h1>发现你的桌游风格</h1>
            <p className="subtext">
              八维度 · {totalQuestions || 35}题 · 依照直觉作答即可。
            </p>
          </div>
          {started && !loading && !loadError ? (
            <button className="ghost" onClick={startOver}>
              重新测评
            </button>
          ) : null}
        </header>

        {loading ? <p className="status">题目加载中…</p> : null}

        {loadError ? <p className="status error">{loadError}</p> : null}

        {!loading && !loadError && !started ? (
          <section className="card intro anim-enter" key="intro">
            <img
              src="/images/board-game-intro.jpg"
              alt=""
              className="card-hero"
              aria-hidden="true"
            />
            <h2>准备好了吗？</h2>
            <p>
              八个维度测出你的桌游玩家风格：目标取向、决策方式、风险偏好、吸引焦点、游戏规模、游戏风格、探索方式、社交强度。
            </p>
            <p>部分题目会探测游戏外的日常倾向，依照第一直觉作答即可。</p>
            <p className="small-note">共 {totalQuestions} 道题</p>
            <button className="primary" onClick={() => setStarted(true)}>
              开始测评
            </button>
          </section>
        ) : null}

        {!loading && !loadError && started && !isFinished && currentQuestion ? (
          <section className="card quiz" key="quiz">
            <div className="progress-wrap">
              <div className="progress-track">
                <span
                  className="progress-value"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="small-note">
                第 {currentIndex + 1} 题 / 共 {totalQuestions} 题
              </p>
            </div>

            <div
              key={`q-${currentIndex}-${direction}`}
              className={`question-slide ${direction === 'forward' ? 'slide-forward' : 'slide-back'}`}
            >
              <h2>{currentQuestion.statement}</h2>
            </div>

            <div className="scale-header">
              <span>不同意</span>
              <span>同意</span>
            </div>
            <div className="scale-row">
              {SCALE_VALUES.map((value) => (
                <DieFace
                  key={value}
                  value={value}
                  pressed={currentAnswer === value}
                  onClick={() => answerQuestion(value)}
                />
              ))}
            </div>

            <div className="actions">
              <button
                className="ghost"
                onClick={goToPrevious}
                disabled={currentIndex === 0}
              >
                上一题
              </button>
              <button
                className="primary"
                onClick={goToNext}
                disabled={
                  currentAnswer === null || currentIndex === totalQuestions - 1
                }
              >
                下一题
              </button>
            </div>
          </section>
        ) : null}

        {!loading && !loadError && started && result ? (
          <section className="card result anim-enter" key="result">
            <img
              src="/images/dice-result.jpg"
              alt=""
              className="card-hero"
              aria-hidden="true"
            />
            <p className="small-note">你的桌游玩家类型</p>

            <div className="type-display">
              {result.picks.map((item, i) => (
                <div
                  key={item.dimension}
                  className="type-badge anim-pop"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="type-letter">{item.winner}</span>
                  <span className="type-name">{traitHint[item.winner]}</span>
                </div>
              ))}
            </div>

            <p className="result-copy">{result.summary}</p>

            <div className="axis-section">
              {result.picks.map((item) => {
                const [leftCode, rightCode] = DIMENSION_POLES[item.dimension as Dimension]
                const markerPct = item.winner === leftCode
                  ? 50 - item.leaning * 0.4
                  : 50 + item.leaning * 0.4
                const fillLeft = Math.min(50, markerPct)
                const fillWidth = Math.abs(50 - markerPct)
                return (
                  <div key={item.dimension} className="axis-row">
                    <span className={`axis-pole${item.winner === leftCode ? ' axis-pole--active' : ''}`}>
                      {traitHint[leftCode]}
                    </span>
                    <div className="axis-track">
                      <div className="axis-fill" style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
                      <div className="axis-marker" style={{ left: `${markerPct}%` }} />
                    </div>
                    <span className={`axis-pole${item.winner === rightCode ? ' axis-pole--active' : ''}`}>
                      {traitHint[rightCode]}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="remarks-list">
              {result.picks.map((item, i) => {
                const remark = remarks[item.winner]
                return (
                  <article
                    key={item.dimension}
                    className="remark-card anim-slide-up"
                    style={{ animationDelay: `${200 + i * 80}ms` }}
                  >
                    <header className="remark-header">
                      <div>
                        <p className="remark-dim">{DIMENSION_NAMES[item.dimension as Dimension]}</p>
                        <p className="remark-arch">{traitHint[item.winner] ?? item.winner}</p>
                        <p className="remark-vs">{item.tied ? '均势' : `强于「${traitHint[item.loser] ?? item.loser}」`}</p>
                      </div>
                      <div className="remark-badge">
                        <span className="remark-letter">{item.winner}</span>
                        <span className="remark-pct">{item.tied ? '—' : `${item.leaning}%`}</span>
                      </div>
                    </header>
                    {remark ? (
                      <>
                        <p className="remark-tagline">「{remark.tagline}」</p>
                        <p className="remark-desc">{remark.description}</p>
                        <p className="remark-section-label">优势</p>
                        <ul className="remark-list remark-strengths">
                          {remark.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                        <p className="remark-section-label">值得留意</p>
                        <ul className="remark-list remark-blindspots">
                          {remark.blind_spots.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </article>
                )
              })}
            </div>

            <button className="primary" onClick={startOver}>
              重新测评
            </button>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
