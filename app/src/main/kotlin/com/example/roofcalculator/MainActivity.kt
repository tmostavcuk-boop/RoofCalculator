package com.example.roofcalculator 

import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import kotlin.math.ceil
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class MainActivity : AppCompatActivity() {

    private lateinit var etBaseA: EditText
    private lateinit var etBaseB: EditText
    private lateinit var etHeight: EditText
    private lateinit var etMaterialWidth: EditText
    private lateinit var spinnerShape: Spinner
    private lateinit var tvResult: TextView
    private lateinit var btnExportPdf: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Ініціалізація всіх елементів з XML
        etBaseA = findViewById(R.id.et_base_a)
        etBaseB = findViewById(R.id.et_base_b)
        etHeight = findViewById(R.id.et_height)
        etMaterialWidth = findViewById(R.id.et_material_width)
        spinnerShape = findViewById(R.id.spinner_shape)
        val btnCalculate: Button = findViewById(R.id.btn_calculate)
        btnExportPdf = findViewById(R.id.btn_export_pdf)
        tvResult = findViewById(R.id.tv_result)

        // Обробник вибору форми
        spinnerShape.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: android.view.View?, position: Int, id: Long) {
                // Приховуємо поле "Верхня ширина" для трикутника
                when (position) {
                    0, 2 -> etBaseB.visibility = android.view.View.VISIBLE 
                    1 -> etBaseB.visibility = android.view.View.GONE       
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        btnCalculate.setOnClickListener {
            calculateRoof()
        }

        btnExportPdf.setOnClickListener {
            val currentResult = tvResult.text.toString()
            if (currentResult.contains("✅ Результат Розрахунку")) {
                createPdf(currentResult)
            } else {
                Toast.makeText(this, "Спочатку виконайте розрахунок.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun calculateRoof() {
        // Зчитування та перевірка вхідних даних
        val shape = spinnerShape.selectedItem.toString()
        val baseA = etBaseA.text.toString().toDoubleOrNull() ?: 0.0
        val baseB = if (shape == "Трикутник") 0.0 else etBaseB.text.toString().toDoubleOrNull() ?: 0.0
        val height = etHeight.text.toString().toDoubleOrNull() ?: 0.0
        val usefulWidth = etMaterialWidth.text.toString().toDoubleOrNull() ?: 0.0

        if (baseA <= 0 || height <= 0 || usefulWidth <= 0 || 
            (shape != "Трикутник" && baseB <= 0))
        {
            tvResult.text = "Будь ласка, введіть коректні додатні розміри!"
            btnExportPdf.isEnabled = false
            return
        }
        
        // 1. Розрахунок Загальної Площі (S)
        val area = when (shape) {
            "Прямокутник" -> baseA * height 
            "Трикутник" -> (baseA * height) / 2.0
            "Трапеція" -> ((baseA + baseB) / 2.0) * height
            else -> 0.0
        }

        // 2. Розрахунок Кількісті Листів
        val maxBase = maxOf(baseA, baseB)
        val numberOfSheetsDouble = maxBase / usefulWidth
        val numberOfSheets = ceil(numberOfSheetsDouble).toInt()
        
        // 3. Генерація Довжин Листів для Карти Розкрою
        val sheetLengths = mutableListOf<Double>()
        val N = numberOfSheets 
        val H = height         

        when (shape) {
            "Трикутник" -> {
                for (i in 1..N) {
                    // Формула подібності трикутників
                    val Li = H * (maxBase - (i - 0.5) * usefulWidth) / maxBase
                    if (Li > 0) {
                        sheetLengths.add(Li)
                    }
                }
            }
            "Прямокутник", "Трапеція" -> {
                // Усі листи мають однакову довжину (H)
                for (i in 1..N) {
                    sheetLengths.add(H)
                }
            }
        }

        // 4. Орієнтовна площа матеріалу для замовлення (10% запас)
        val estimatedOrderArea = area * 1.10 
        
        // 5. Формування результату
        val sheetDetails = sheetLengths.joinToString(separator = "\n") { length ->
            "Лист №${sheetLengths.indexOf(length) + 1}: ${"%.2f".format(length)} м"
        }

        val resultText = """
            ✅ Результат Розрахунку ($shape):
            
            Загальна площа ската: ${"%.2f".format(area)} м²
            Кількість листів по ширині: $N шт.
            
            ---
            **Карта Розкрою (Довжини Листів)**
            ---
            $sheetDetails
            
            Орієнтовна площа матеріалу для замовлення (з 10% запасом):
            ${"%.2f".format(estimatedOrderArea)} м²
        """.trimIndent()

        tvResult.text = resultText
        btnExportPdf.isEnabled = true
    }

    private fun createPdf(resultText: String) {
        val pdfDocument = android.graphics.pdf.PdfDocument()
        val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDocument.startPage(pageInfo)
        val canvas = page.canvas
        val paint = Paint()

        paint.textSize = 10f
        paint.color = Color.BLACK
        
        val lines = resultText.split('\n')
        var y = 40f 
        val margin = 40f
        val lineHeight = 18f 

        // Заголовок
        paint.textSize = 20f
        paint.isFakeBoldText = true
        canvas.drawText("Звіт про Розрахунок Покрівлі", margin, y, paint)
        y += 40f

        // Вміст
        paint.textSize = 12f
        paint.isFakeBoldText = false

        for (line in lines) {
            // Перевірка на переповнення сторінки
            if (y > pageInfo.pageHeight - 40f) {
                pdfDocument.finishPage(page)
                val newPageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, pageInfo.pageNumber + 1).create()
                pdfDocument.startPage(newPageInfo)
                y = 40f 
            }
            
            // Виділення жирним ключових блоків
            val isBoldBlock = line.contains("✅ Результат") || line.contains("**Карта Розкрою") || line.contains("---")
            paint.isFakeBoldText = isBoldBlock

            canvas.drawText(line, margin, y, paint)
            y += lineHeight
        }

        pdfDocument.finishPage(page)

        // Збереження файлу
        try {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val fileName = "RoofCalculation_${System.currentTimeMillis()}.pdf"
            val file = File(downloadsDir, fileName)
            
            pdfDocument.writeTo(FileOutputStream(file))
            
            Toast.makeText(this, "Проект збережено у ${file.absolutePath}", Toast.LENGTH_LONG).show()
            
            openPdfFile(file)
            
        } catch (e: IOException) {
            Toast.makeText(this, "Помилка при збереженні PDF: ${e.message}", Toast.LENGTH_LONG).show()
        } finally {
            pdfDocument.close()
        }
    }
    
    // Функція для відкриття PDF
    private fun openPdfFile(file: File) {
        if (!file.exists()) return

        try {
            val uri: Uri = FileProvider.getUriForFile(
                this,
                "${packageName}.provider", 
                file
            )
            
            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(uri, "application/pdf")
            intent.flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
            
            startActivity(intent)
            
        } catch (e: Exception) {
            Toast.makeText(this, "Не знайдено програми для відкриття PDF.", Toast.LENGTH_SHORT).show()
        }
    }
}
