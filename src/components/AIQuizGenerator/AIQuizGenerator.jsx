"use client";

import { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Question } from "../../context/QuestionContext";
import { auth } from "../Firebase/Firebase";
import "./AIQuizGenerator.css";
import { v4 as uuidv4 } from "uuid";
import { toast } from "react-toastify";
import { createQuiz, AI_URL } from "../Api/Api";

function AIQuizGenerator() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const navigate = useNavigate();
  const { setQuiz, setMainQuestion, setDisplayQuestion } = useContext(Question);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        navigate("/login");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const generateQuiz = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt to generate a quiz");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(10);

    try {
      const response = await fetch(`${AI_URL}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // "x-goog-api-key": process.env.GEMINI_API_KEY, // or pass it securely from env
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt, // prompt should be a string like: "create a quiz about animals with 5 questions and answers"
                },
              ],
            },
          ],
        }),
      });

      setGenerationProgress(50);

      if (!response.ok) {
        throw new Error("Failed to generate quiz");
      }

      // const responseJson = await response.json();

      const rawText = (await response.json())?.candidates?.[0]?.content
        ?.parts?.[0]?.text;
      const data = parseQuizText(rawText);
      console.log(data);
      debugger;

      // Format the quiz data according to your application's structure
      const formattedQuiz = {
        _id: uuidv4(),
        name: data.quizTitle || `Quiz on ${prompt.substring(0, 30)}...`,
        creatorId: user?.uid,
        creatorName: user?.displayName || user?.email,
        numberOfQuestions: data.questions?.length,
        questionType: "Quiz",
        pointType: "Standard",
        answerTime: 10,
        questionList: data.questions.map((q, index) => ({
          questionIndex: index + 1,
          question: q.question,
          answerList: [
            {
              name: "option1",
              body: q.options[0],
              isCorrect: q.correctIndex === 0,
            },
            {
              name: "option2",
              body: q.options[1],
              isCorrect: q.correctIndex === 1,
            },
            {
              name: "option3",
              body: q.options[2],
              isCorrect: q.correctIndex === 2,
            },
            {
              name: "option4",
              body: q.options[3],
              isCorrect: q.correctIndex === 3,
            },
          ],
        })),
      };

      // Update context with the new quiz
      console.log("formatted quiz", formattedQuiz);
      setQuiz(formattedQuiz);
      setMainQuestion(formattedQuiz.questionList);
      setDisplayQuestion(formattedQuiz.questionList[0]);

      // Save the quiz to the database
      await createQuiz(formattedQuiz);
      setGenerationProgress(100);

      toast.success("Quiz generated successfully!");
      navigate("/create");
    } catch (error) {
      console.error("Error generating quiz:", error);
      toast.error("Failed to generate quiz. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };
  function parseQuizText(rawText) {
    const questions = [];

    // Extract quiz title
    const titleMatch = rawText.match(
      /\*\*(.+?)\*\*\s*[\n\r]*(?:Instructions|\*\*\d+\.)/i
    );
    const quizTitle = titleMatch ? titleMatch[1].trim() : "Untitled Quiz";
    console.log("Extracted Quiz Title:", quizTitle); // Debug: Check extracted title

    // Extract answer key
    const answerKeyMatch = rawText.match(
      /\*\*Answer Key:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/
    );
    const answerLines =
      answerKeyMatch?.[1]
        ?.trim()
        .split("\n")
        .filter((line) => /^\d+\.\s+[a-d]\)/i.test(line.trim())) || [];

    const answerMap = {};
    for (const line of answerLines) {
      const match = line.match(/^(\d+)\.\s+([a-d])\)/i);
      if (match) {
        answerMap[match[1]] = match[2].toLowerCase();
      }
    }
    console.log("Answer Map:", answerMap); // Debug: Check answer key parsing

    // Match question blocks
    const questionBlockRegex =
      /\*\*(\d+)\.\s+(.+?)\*\*\s*([\s\S]+?)(?=\n\*\*\d+\.|$)/g;

    let match;
    while ((match = questionBlockRegex.exec(rawText)) !== null) {
      const questionNumber = match[1];
      const questionText = match[2].trim();
      const optionsBlock = match[3].trim();

      console.log(`Question ${questionNumber}:`, {
        questionText,
        optionsBlock,
      }); // Debug: Check matched question

      // Extract options with flexible whitespace handling
      const optionLines = optionsBlock
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && /^[a-d]\)\s*/.test(line)); // Match a), b), etc.

      const options = optionLines.map((line, index) => {
        const optMatch = line.match(/^[a-d]\)\s*(.+)/i); // Flexible whitespace after a)
        const optionText = optMatch ? optMatch[1].trim() : "";
        console.log(
          `Option ${index + 1} for Question ${questionNumber}:`,
          optionText
        ); // Debug: Check each option
        return optionText;
      });

      // Ensure exactly 4 options
      while (options.length < 4) {
        options.push("");
      }

      // Get correct answer index
      const correctLetter = answerMap[questionNumber] || "";
      const correctIndex = correctLetter
        ? { a: 0, b: 1, c: 2, d: 3 }[correctLetter.toLowerCase()] ?? -1
        : -1;

      questions.push({
        question: questionText,
        options,
        correctIndex,
      });
    }

    console.log("Parsed Questions:", questions); // Debug: Check final questions array

    return {
      quizTitle,
      questions,
    };
  }
  return (
    <div className="ai-generator-container">
      <div className="ai-generator-header">
        <h1>AI Quiz Generator</h1>
        <p>Enter a topic or description to generate a quiz using AI</p>
      </div>

      <div className="ai-generator-form">
        <div className="prompt-container">
          <label htmlFor="prompt">Describe the quiz you want to create:</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g., Create a quiz about the solar system with 5 multiple-choice questions"
            rows={6}
            disabled={isGenerating}
          />
        </div>

        <div className="examples">
          <h3>Example prompts:</h3>
          <ul>
            <li
              onClick={() =>
                setPrompt(
                  "Create a 5-question quiz about World War II important events"
                )
              }
            >
              "Create a 5-question quiz about World War II important events"
            </li>
            <li
              onClick={() =>
                setPrompt("Generate a quiz on basic computer science concepts")
              }
            >
              "Generate a quiz on basic computer science concepts"
            </li>
            <li
              onClick={() =>
                setPrompt(
                  "Make a beginner-friendly quiz about famous paintings and artists"
                )
              }
            >
              "Make a beginner-friendly quiz about famous paintings and artists"
            </li>
          </ul>
        </div>

        {isGenerating ? (
          <div className="generation-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${generationProgress}%` }}
              ></div>
            </div>
            <p>Generating your quiz... {generationProgress}%</p>
          </div>
        ) : (
          <div className="button-container">
            <button className="generate-btn" onClick={generateQuiz}>
              Generate Quiz
            </button>
            <button
              className="cancel-btn"
              onClick={() => navigate("/dashboard")}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIQuizGenerator;
