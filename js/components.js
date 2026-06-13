const { useState, useEffect } = React;

function PredictionTable() {
    const [predictions, setPredictions] = useState(
        window.latestAIPredictions || [
            { date: 'Memuat...', water: 0, category: 'Memuat...', recommendation: 'Harap tunggu...' }
        ]
    );
    
    useEffect(() => {
        // Cek jika data sudah ada saat komponen baru di-mount
        if (window.latestAIPredictions) {
            setPredictions(window.latestAIPredictions);
        }

        const handleDataFetched = (event) => {
            if (event.detail && event.detail.length > 0) {
                setPredictions(event.detail);
            }
        };
        
        // Listener dari event yang di-dispatch oleh main.js
        window.addEventListener('dashboardDataFetched', handleDataFetched);
        
        return () => {
            window.removeEventListener('dashboardDataFetched', handleDataFetched);
        };
    }, []);
    
    const handleRepredict = () => {
        // Tampilkan notifikasi
        alert('Fitur prediksi ulang (machine learning) sedang diproses oleh backend...');
    };
    
    const handleExport = async () => {
        if (typeof ExcelJS === 'undefined' || typeof saveAs === 'undefined') {
            alert('Library ekspor sedang dimuat, harap tunggu sebentar dan coba lagi.');
            return;
        }
        
        try {
            // Buat workbook dan worksheet baru
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Sistem Monitoring IoT';
            workbook.created = new Date();
            
            const worksheet = workbook.addWorksheet('Data Prediksi Air');
            
            // Tambahkan judul laporan
            worksheet.mergeCells('A1:E1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'LAPORAN PREDIKSI KEBUTUHAN AIR SAWAH TADAH HUJAN';
            titleCell.font = { name: 'Arial', size: 14, bold: true };
            titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
            
            worksheet.mergeCells('A2:E2');
            const subTitleCell = worksheet.getCell('A2');
            subTitleCell.value = 'Dicetak pada: ' + new Date().toLocaleString('id-ID');
            subTitleCell.font = { name: 'Arial', size: 11, italic: true };
            subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
            
            worksheet.addRow([]); // Baris kosong
            
            // Tentukan kolom (kunci kolom ini tidak otomatis jadi header di ExcelJS untuk addRow array)
            worksheet.columns = [
                { key: 'no', width: 5 },
                { key: 'date', width: 20 },
                { key: 'water', width: 25 },
                { key: 'category', width: 25 },
                { key: 'recommendation', width: 50 }
            ];
            
            // Header tabel di baris 4
            const headerRow = worksheet.getRow(4);
            headerRow.values = ['No', 'Tanggal', 'Prediksi Kebutuhan Air', 'Kategori Pengairan', 'Rekomendasi'];
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF2E7D32' } // primary-green
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            
            // Tambahkan data
            let currentRow = 5;
            predictions.forEach((p, index) => {
                const row = worksheet.getRow(currentRow);
                row.values = [
                    index + 1,
                    p.date,
                    p.water + ' Liter',
                    p.category,
                    p.recommendation
                ];
                
                row.alignment = { vertical: 'middle', wrapText: true };
                row.getCell('no').alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell('water').alignment = { horizontal: 'center', vertical: 'middle', font: { bold: true } };
                
                // Styling per kategori
                const catCell = row.getCell('category');
                catCell.alignment = { horizontal: 'center', vertical: 'middle' };
                if (p.category === 'Pengairan Tinggi') {
                    catCell.font = { color: { argb: 'FFC62828' }, bold: true };
                } else if (p.category === 'Pengairan Sedang') {
                    catCell.font = { color: { argb: 'FFF57F17' }, bold: true };
                } else if (p.category === 'Pengairan Rendah') {
                    catCell.font = { color: { argb: 'FF2E7D32' }, bold: true };
                } else {
                    catCell.font = { bold: true };
                }
                
                currentRow++;
            });
            
            // Tambahkan border untuk tabel (mulai dari baris 4 sampai data terakhir)
            for (let i = 4; i < currentRow; i++) {
                const row = worksheet.getRow(i);
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            }
            
            // Ekspor file XLSX
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            // Buat nama file dinamis berdasarkan waktu saat ini
            const now = new Date();
            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
            const filename = `Laporan_Prediksi_Air_${dateStr}_${timeStr}.xlsx`;
            
            saveAs(blob, filename);
            
            alert('Data telah berhasil diekspor dengan format tabel template!');
            
        } catch (error) {
            console.error('Export Error:', error);
            alert('Terjadi kesalahan saat mengekspor data.');
        }
    };
    
    const getCategoryClass = (category) => {
        switch(category) {
            case 'Pengairan Rendah': return 'irrigation-low';
            case 'Pengairan Sedang': return 'irrigation-medium';
            case 'Pengairan Tinggi': return 'irrigation-high';
            case 'Tidak Perlu Pengairan': return 'irrigation-none';
            default: return '';
        }
    };
    
    return (
        <div className="card p-0 overflow-hidden">
            <div className="header-bg p-4">
                <h2 className="text-xl font-bold flex items-center">
                    <i className="fas fa-tint mr-3"></i>PREDIKSI KEBUTUHAN AIR
                </h2>
            </div>
            <div className="p-4">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                            <tr>
                                <th className="p-3 text-left font-bold">Tanggal</th>
                                <th className="p-3 text-left font-bold">Prediksi Kebutuhan Air</th>
                                <th className="p-3 text-left font-bold">Kategori Pengairan</th>
                                <th className="p-3 text-left font-bold">Rekomendasi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {predictions.map((pred, index) => (
                                <tr key={index} className="table-row border-b border-gray-200">
                                    <td className="p-3 font-medium">{pred.date}</td>
                                    <td className="p-3 font-bold">{pred.water} L</td>
                                    <td className="p-3">
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${getCategoryClass(pred.category)}`}>
                                            {pred.category}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center">
                                            <i className="fas fa-info-circle text-green-600 mr-2"></i>
                                            {pred.recommendation}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                <div className="mt-6 flex flex-wrap gap-4">
                    <button 
                        onClick={handleRepredict}
                        className="btn-primary flex items-center"
                    >
                        <i className="fas fa-sync-alt mr-2"></i>PREDIKSI ULANG
                    </button>
                    <button 
                        onClick={handleExport}
                        className="btn-secondary flex items-center"
                    >
                        <i className="fas fa-download mr-2"></i>EKSPOR DATA
                    </button>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-bold text-blue-800 mb-2">Keterangan Kategori Pengairan:</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="irrigation-low p-2 rounded text-center">Pengairan Rendah</div>
                        <div className="irrigation-medium p-2 rounded text-center">Pengairan Sedang</div>
                        <div className="irrigation-high p-2 rounded text-center">Pengairan Tinggi</div>
                        <div className="irrigation-none p-2 rounded text-center">Tidak Perlu Pengairan</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Render komponen React
ReactDOM.render(<PredictionTable />, document.getElementById('prediction-container'));
