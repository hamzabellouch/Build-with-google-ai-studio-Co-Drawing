/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {Content, GoogleGenAI} from '@google/genai';
import {
  Star,
  ChevronDown,
  Eraser,
  LoaderCircle,
  Palette,
  SendHorizontal,
  Trash2,
  X,
  Settings,
  Download,
} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m[1];
    const err = JSON.parse(e);
    return err.message || error;
  } catch (e) {
    return error;
  }
}

export default function Home() {
  const canvasRef = useRef(null);
  const backgroundImageRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [drawMode, setDrawMode] = useState('pen'); // 'pen' or 'eraser'
  const colorInputRef = useRef(null);
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-image');

  const isLoading = !!loadingAction;

  // Load background image when generatedImage changes
  useEffect(() => {
    if (generatedImage && canvasRef.current) {
      // Use the window.Image constructor to avoid conflict with Next.js Image component
      const img = new window.Image();
      img.onload = () => {
        backgroundImageRef.current = img;
        drawImageToCanvas();
      };
      img.src = generatedImage;
    }
  }, [generatedImage]);

  // Initialize canvas with white background when component mounts
  useEffect(() => {
    if (canvasRef.current) {
      initializeCanvas();
    }
  }, []);

  // Initialize canvas with white background
  const initializeCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Fill canvas with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  // Draw the background image to the canvas
  const drawImageToCanvas = () => {
    if (!canvasRef.current || !backgroundImageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Fill with white background first
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the background image
    ctx.drawImage(
      backgroundImageRef.current,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  };

  // Get the correct coordinates based on canvas scaling
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Calculate the scaling factor between the internal canvas size and displayed size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Apply the scaling to get accurate coordinates
    return {
      x:
        (e.nativeEvent.offsetX ||
          e.nativeEvent.touches?.[0]?.clientX - rect.left) * scaleX,
      y:
        (e.nativeEvent.offsetY ||
          e.nativeEvent.touches?.[0]?.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const {x, y} = getCoordinates(e);

    // Prevent default behavior to avoid scrolling on touch devices
    if (e.type === 'touchstart') {
      e.preventDefault();
    }

    // Set drawing/erasing properties
    ctx.lineCap = 'round';
    if (drawMode === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = 5;
    } else {
      // 'eraser'
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 20; // Make eraser thicker
    }

    // Start a new path without clearing the canvas
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    // Prevent default behavior to avoid scrolling on touch devices
    if (e.type === 'touchmove') {
      e.preventDefault();
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const {x, y} = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Fill with white instead of just clearing
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    setGeneratedImage(null);
    backgroundImageRef.current = null;
  };

  const handleColorChange = (e) => {
    setPenColor(e.target.value);
  };

  const openColorPicker = () => {
    setDrawMode('pen'); // Switch to pen mode when selecting a color
    if (colorInputRef.current) {
      colorInputRef.current.click();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      openColorPicker();
    }
  };

  const toggleEraser = () => {
    setDrawMode((prev) => (prev === 'pen' ? 'eraser' : 'pen'));
  };

  const handleDownload = () => {
    if (!canvasRef.current || !generatedImage) return;

    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'co-drawing.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerate = async (
    generationType: 'send' | 'colorize' | 'realism',
  ) => {
    if (!canvasRef.current) return;

    let geminiPrompt = '';
    switch (generationType) {
      case 'send':
        if (!prompt) {
          return;
        }
        geminiPrompt = `${prompt}. Keep the same simple line drawing style.`;
        break;
      case 'colorize':
        geminiPrompt =
          'Colorize this drawing. Fill the areas with vibrant, solid colors. Keep the original line art.';
        break;
      case 'realism':
        geminiPrompt = 'Create a realistic image based on this drawing.';
        break;
      default:
        return;
    }

    setLoadingAction(generationType);

    try {
      // Get the drawing as base64 data
      const canvas = canvasRef.current;

      // Create a temporary canvas to add white background
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Fill with white background
      tempCtx.fillStyle = '#FFFFFF';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Draw the original canvas content on top of the white background
      tempCtx.drawImage(canvas, 0, 0);

      const drawingData = tempCanvas.toDataURL('image/png').split(',')[1];

      const contents: Content[] = [
        {
          role: 'USER',
          parts: [{inlineData: {data: drawingData, mimeType: 'image/png'}}],
        },
        {
          role: 'USER',
          parts: [
            {
              text: geminiPrompt,
            },
          ],
        },
      ];

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
      });

      const data = {
        success: true,
        message: '',
        imageData: null,
        error: undefined,
      };

      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          data.message = part.text;
        } else if (part.inlineData) {
          data.imageData = part.inlineData.data;
        }
      }

      if (data.success && data.imageData) {
        const imageUrl = `data:image/png;base64,${data.imageData}`;
        setGeneratedImage(imageUrl);
      } else {
        console.error('Failed to generate image:', data.error);
        alert('Image generation failed. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting drawing:', error);
      setErrorMessage(error.message || 'An unexpected error occurred.');
      setShowErrorModal(true);
    } finally {
      setLoadingAction(null);
    }
  };

  // Close the error modal
  const closeErrorModal = () => {
    setShowErrorModal(false);
  };

  // Handle the custom API key submission
  const handleApiKeySubmit = (e) => {
    e.preventDefault();
    setShowErrorModal(false);
    // Will use the customApiKey state in the next API call
  };

  // Add touch event prevention function
  useEffect(() => {
    // Function to prevent default touch behavior on canvas
    const preventTouchDefault = (e) => {
      if (isDrawing) {
        e.preventDefault();
      }
    };

    // Add event listener when component mounts
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', preventTouchDefault, {
        passive: false,
      });
      canvas.addEventListener('touchmove', preventTouchDefault, {
        passive: false,
      });
    }

    // Remove event listener when component unmounts
    return () => {
      if (canvas) {
        canvas.removeEventListener('touchstart', preventTouchDefault);
        canvas.removeEventListener('touchmove', preventTouchDefault);
      }
    };
  }, [isDrawing]);

  return (
    <>
      <div
        className="min-h-screen notebook-paper-bg text-gray-900 flex flex-col justify-start items-center">
        <main className="container mx-auto px-3 sm:px-6 py-5 sm:py-10 pb-32 max-w-5xl w-full">
          {/* Header section with title and tools */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-2 sm:mb-6 gap-2">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold mb-0 leading-tight font-handwritten">
                Co-drawing
              </h1>
              <p className="text-sm sm:text-base text-gray-500 mt-1">
                Built with{' '}
                <a
                  className="underline"
                  href="https://ai.google.dev/gemini-api/docs/image-generation"
                  target="_blank"
                  rel="noopener noreferrer">
                  Gemini's native image generation
                </a>
              </p>
              <p className="text-sm sm:text-base text-gray-500 mt-1">
                By{' '}
                <a
                  className="underline"
                  href="https://www.instagram.com/tknohamza/"
                  target="_blank"
                  rel="noopener noreferrer">
                  @tknohamza
                </a>
              </p>
            </div>

            <menu className="flex items-center bg-gray-300 rounded-full p-2 shadow-sm self-start sm:self-auto gap-2">
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="h-10 rounded-full bg-white pl-3 pr-8 text-sm text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 appearance-none border-2 border-white"
                  aria-label="Select Gemini Model">
                  <option value="gemini-2.5-flash-image">2.5 Flash</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <ChevronDown className="w-5 h-5" aria-hidden="true" />
                </div>
              </div>
              <button
                type="button"
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110"
                aria-label="Settings">
                <Settings className="w-5 h-5 text-gray-700" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!generatedImage}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110 disabled:bg-gray-200 disabled:cursor-not-allowed disabled:hover:scale-100"
                aria-label="Download Image"
                title="Download Image">
                <Download className="w-5 h-5 text-gray-700" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={toggleEraser}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-110 ${
                  drawMode === 'eraser'
                    ? 'bg-blue-200 border-2 border-blue-400'
                    : 'bg-white hover:bg-gray-50'
                }`}
                aria-label="Toggle Eraser">
                <Eraser className="w-5 h-5 text-gray-700" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border-2 border-white shadow-sm transition-transform hover:scale-110"
                onClick={openColorPicker}
                onKeyDown={handleKeyDown}
                aria-label="Open color picker"
                style={{backgroundColor: penColor}}>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={penColor}
                  onChange={handleColorChange}
                  className="opacity-0 absolute w-px h-px"
                  aria-label="Select pen color"
                />
              </button>
              <button
                type="button"
                onClick={clearCanvas}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm transition-all hover:bg-gray-50 hover:scale-110"
                aria-label="Clear Canvas"
                title="Clear Canvas">
                <Trash2
                  className="w-5 h-5 text-gray-700"
                  aria-hidden="true"
                />
              </button>
            </menu>
          </div>

          {/* Canvas section with notebook paper background */}
          <div className="w-full mb-6">
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className={`border-2 border-black w-full sm:h-[60vh] h-[30vh] min-h-[320px] bg-white/90 touch-none ${
                drawMode === 'eraser'
                  ? 'eraser-cursor'
                  : 'hover:cursor-crosshair'
              }`}
            />
          </div>

          {/* Input form that matches canvas width */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate('send');
            }}
            className="w-full">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Add your creative touch..."
                className="w-full p-3 sm:p-4 pr-32 sm:pr-40 text-sm sm:text-base border-2 border-black bg-white text-gray-800 shadow-sm focus:ring-2 focus:ring-gray-200 focus:outline-none transition-all"
                required
              />
              <div
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerate('colorize')}
                  disabled={isLoading}
                  className="p-1.5 sm:p-2 rounded-full bg-black text-white hover:cursor-pointer hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  aria-label="Colorize Drawing"
                  title="Colorize Drawing">
                  {loadingAction === 'colorize' ? (
                    <LoaderCircle className="w-5 sm:w-6 h-5 sm:h-6 animate-spin" aria-hidden="true" />
                  ) : (
                    <Palette className="w-5 sm:w-6 h-5 sm:h-6" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerate('realism')}
                  disabled={isLoading}
                  className="p-1.5 sm:p-2 rounded-full bg-black text-white hover:cursor-pointer hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  aria-label="Make it realistic"
                  title="Make it realistic">
                  {loadingAction === 'realism' ? (
                    <LoaderCircle className="w-5 sm:w-6 h-5 sm:h-6 animate-spin" aria-hidden="true" />
                  ) : (
                    <Star className="w-5 sm:w-6 h-5 sm:h-6" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="p-1.5 sm:p-2 rounded-full bg-black text-white hover:cursor-pointer hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send"
                  title="Send">
                  {loadingAction === 'send' ? (
                    <LoaderCircle
                      className="w-5 sm:w-6 h-5 sm:h-6 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <SendHorizontal
                      className="w-5 sm:w-6 h-5 sm:h-6"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            </div>
          </form>
        </main>
        {/* Error Modal */}
        {showErrorModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-700">
                  Generation Failed
                </h3>
                <button
                  onClick={closeErrorModal}
                  className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="font-medium text-gray-600">
                {parseError(errorMessage)}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}