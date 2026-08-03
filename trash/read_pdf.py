import PyPDF2
import sys

def extract_pdf_text(filepath):
    try:
        with open(filepath, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n\n"
            
            with open("proposal_extracted.txt", "w", encoding="utf-8") as out:
                out.write(text)
            print("Extracted successfully.")
    except Exception as e:
        print(f"Error: {e}")

extract_pdf_text("proposal HASIL REVISI.pdf")
